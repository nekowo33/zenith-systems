const pool = require('../db/pool');
const { hydrate } = require('../db/mapper');
const { HttpError, wrap } = require('../middleware/error');

exports.checkout = wrap(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the cart rows and the laptop rows so stock can't change underneath us.
    const [items] = await conn.query(
      `SELECT ci.laptop_id, ci.quantity, l.price_php, l.stock_qty, l.is_active, l.brand, l.model
       FROM cart_items ci JOIN laptops l ON l.id = ci.laptop_id
       WHERE ci.user_id = ? ORDER BY ci.id FOR UPDATE`,
      [req.user.id]
    );
    if (!items.length) throw new HttpError(400, 'Your cart is empty');

    let total = 0;
    for (const it of items) {
      if (!it.is_active) throw new HttpError(400, `${it.brand} ${it.model} is no longer available`);
      if (it.quantity > it.stock_qty)
        throw new HttpError(400, `Not enough stock for ${it.brand} ${it.model} (only ${it.stock_qty} left)`);
      total += it.price_php * it.quantity;
    }

    const [order] = await conn.query('INSERT INTO orders (user_id, total_php) VALUES (?, ?)', [req.user.id, total]);
    for (const it of items) {
      await conn.query(
        'INSERT INTO order_items (order_id, laptop_id, quantity, unit_price_php) VALUES (?, ?, ?, ?)',
        [order.insertId, it.laptop_id, it.quantity, it.price_php]
      );
      const [upd] = await conn.query(
        'UPDATE laptops SET stock_qty = stock_qty - ? WHERE id = ? AND stock_qty >= ?',
        [it.quantity, it.laptop_id, it.quantity]
      );
      if (!upd.affectedRows) throw new HttpError(400, `Not enough stock for ${it.brand} ${it.model}`);
    }
    await conn.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);

    await conn.commit();
    res.status(201).json({ orderId: order.insertId, totalPhp: total, status: 'pending' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

exports.list = wrap(async (req, res) => {
  const [orders] = await pool.query(
    'SELECT id, total_php, status, created_at FROM orders WHERE user_id = ? ORDER BY id DESC',
    [req.user.id]
  );
  if (!orders.length) return res.json({ orders: [] });

  const [rows] = await pool.query(
    `SELECT l.*, oi.id AS item_id, oi.order_id, oi.quantity AS item_quantity, oi.unit_price_php
     FROM order_items oi JOIN laptops l ON l.id = oi.laptop_id
     WHERE oi.order_id IN (?) ORDER BY oi.id`,
    [orders.map((o) => o.id)]
  );
  const laptops = await hydrate(rows);
  const byOrder = new Map();
  rows.forEach((r, i) => {
    if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, []);
    byOrder.get(r.order_id).push({
      id: r.item_id,
      quantity: r.item_quantity,
      unitPricePhp: r.unit_price_php,
      laptop: laptops[i],
    });
  });

  res.json({
    orders: orders.map((o) => ({
      id: o.id,
      totalPhp: o.total_php,
      status: o.status,
      createdAt: new Date(o.created_at).toISOString(),
      items: byOrder.get(o.id) || [],
    })),
  });
});
