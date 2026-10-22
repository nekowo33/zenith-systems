const pool = require('../db/pool');
const { hydrate } = require('../db/mapper');
const { HttpError, wrap } = require('../middleware/error');
const { toPosInt } = require('../middleware/validate');

async function buildCart(userId) {
  const [rows] = await pool.query(
    `SELECT l.*, ci.id AS item_id, ci.quantity AS item_quantity
     FROM cart_items ci JOIN laptops l ON l.id = ci.laptop_id
     WHERE ci.user_id = ? ORDER BY ci.id`,
    [userId]
  );
  const laptops = await hydrate(rows);
  const items = rows.map((r, i) => ({ id: r.item_id, quantity: r.item_quantity, laptop: laptops[i] }));
  const totalPhp = items.reduce((sum, it) => sum + it.laptop.pricePhp * it.quantity, 0);
  return { items, totalPhp };
}

exports.get = wrap(async (req, res) => res.json(await buildCart(req.user.id)));

exports.add = wrap(async (req, res) => {
  const { laptopId, quantity } = req.body || {};
  const lid = toPosInt(laptopId);
  const qty = toPosInt(quantity);
  if (!lid) throw new HttpError(400, 'laptopId must be a positive integer');
  if (!qty) throw new HttpError(400, 'quantity must be a positive integer');

  const [lap] = await pool.query('SELECT id, stock_qty FROM laptops WHERE id = ? AND is_active = 1', [lid]);
  if (!lap.length) throw new HttpError(404, 'Laptop not found');
  const stock = lap[0].stock_qty;
  if (stock <= 0) throw new HttpError(400, 'This laptop is out of stock');

  const [existing] = await pool.query('SELECT quantity FROM cart_items WHERE user_id = ? AND laptop_id = ?', [req.user.id, lid]);
  const newQty = (existing.length ? existing[0].quantity : 0) + qty;
  if (newQty > stock) throw new HttpError(400, `Only ${stock} in stock`);

  await pool.query(
    `INSERT INTO cart_items (user_id, laptop_id, quantity) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = ?`,
    [req.user.id, lid, newQty, newQty]
  );
  res.json(await buildCart(req.user.id));
});

exports.update = wrap(async (req, res) => {
  const itemId = toPosInt(req.params.itemId);
  const qty = toPosInt((req.body || {}).quantity);
  if (!itemId) throw new HttpError(404, 'Cart item not found');
  if (!qty) throw new HttpError(400, 'quantity must be a positive integer');

  const [rows] = await pool.query(
    `SELECT ci.id, l.stock_qty FROM cart_items ci JOIN laptops l ON l.id = ci.laptop_id
     WHERE ci.id = ? AND ci.user_id = ?`,
    [itemId, req.user.id]
  );
  if (!rows.length) throw new HttpError(404, 'Cart item not found');
  if (qty > rows[0].stock_qty) throw new HttpError(400, `Only ${rows[0].stock_qty} in stock`);

  await pool.query('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [qty, itemId, req.user.id]);
  res.json(await buildCart(req.user.id));
});

exports.remove = wrap(async (req, res) => {
  const itemId = toPosInt(req.params.itemId);
  if (!itemId) throw new HttpError(404, 'Cart item not found');
  const [result] = await pool.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [itemId, req.user.id]);
  if (!result.affectedRows) throw new HttpError(404, 'Cart item not found');
  res.json(await buildCart(req.user.id));
});
