const pool = require('../db/pool');
const { hydrate } = require('../db/mapper');
const { HttpError, wrap } = require('../middleware/error');
const { str, nonNegInt } = require('../middleware/validate');

const CATEGORIES = ['everyday', 'work', 'gaming', 'creator', 'programming', 'chromebook', 'two_in_one', 'macbook', 'budget'];
const USE_CASES = ['school', 'office', 'creating', 'gaming', 'programming'];
const SORTS = {
  price_asc: 'l.price_php ASC, l.id ASC',
  price_desc: 'l.price_php DESC, l.id ASC',
  newest: 'l.release_year DESC, l.id DESC',
};
const AVAIL = { in: 'l.stock_qty > 5', low: 'l.stock_qty BETWEEN 1 AND 5', out: 'l.stock_qty = 0' };

exports.list = wrap(async (req, res) => {
  const q = req.query;
  const where = ['l.is_active = 1'];
  const params = [];

  if (q.category !== undefined) {
    const v = str(q.category, 'category');
    if (!CATEGORIES.includes(v)) throw new HttpError(400, 'Invalid category');
    where.push('l.category = ?'); params.push(v);
  }
  if (q.brand !== undefined) { where.push('l.brand = ?'); params.push(str(q.brand, 'brand')); }
  if (q.useCase !== undefined) {
    const v = str(q.useCase, 'useCase');
    if (!USE_CASES.includes(v)) throw new HttpError(400, 'Invalid useCase');
    where.push('EXISTS (SELECT 1 FROM laptop_use_cases u WHERE u.laptop_id = l.id AND u.use_case = ?)');
    params.push(v);
  }
  const min = q.minPrice !== undefined ? nonNegInt(q.minPrice, 'minPrice') : null;
  const max = q.maxPrice !== undefined ? nonNegInt(q.maxPrice, 'maxPrice') : null;
  if (min !== null && max !== null && min > max) throw new HttpError(400, 'minPrice cannot exceed maxPrice');
  if (min !== null) { where.push('l.price_php >= ?'); params.push(min); }
  if (max !== null) { where.push('l.price_php <= ?'); params.push(max); }

  if (q.q !== undefined) {
    const term = str(q.q, 'q');
    if (term) {
      const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
      where.push(`(l.brand LIKE ? OR l.model LIKE ? OR CONCAT(l.brand, ' ', l.model) LIKE ?)`);
      params.push(like, like, like);
    }
  }
  if (q.availability !== undefined) {
    const v = str(q.availability, 'availability');
    if (!AVAIL[v]) throw new HttpError(400, 'availability must be in, low or out');
    where.push(AVAIL[v]);
  }

  let orderBy = 'l.id ASC';
  if (q.sort !== undefined) {
    const v = str(q.sort, 'sort');
    if (!SORTS[v]) throw new HttpError(400, 'sort must be price_asc, price_desc or newest');
    orderBy = SORTS[v];
  }

  let page = 1, limit = 12;
  if (q.page !== undefined) { page = nonNegInt(q.page, 'page'); if (page < 1) throw new HttpError(400, 'page must be at least 1'); }
  if (q.limit !== undefined) {
    limit = nonNegInt(q.limit, 'limit');
    if (limit < 1 || limit > 100) throw new HttpError(400, 'limit must be between 1 and 100');
  }

  const whereSql = where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM laptops l WHERE ${whereSql}`, params);
  const [rows] = await pool.query(
    `SELECT l.* FROM laptops l WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  res.json({ items: await hydrate(rows), total, page, limit });
});

exports.getOne = wrap(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw new HttpError(404, 'Laptop not found');
  const [rows] = await pool.query('SELECT * FROM laptops WHERE id = ? AND is_active = 1', [Number(req.params.id)]);
  if (!rows.length) throw new HttpError(404, 'Laptop not found');
  res.json((await hydrate(rows))[0]);
});

exports.compare = wrap(async (req, res) => {
  const raw = str(req.query.ids === undefined ? '' : req.query.ids, 'ids');
  const ids = raw.split(',').map((s) => s.trim());
  if (!ids.every((s) => /^\d+$/.test(s))) throw new HttpError(400, 'ids must be comma-separated numbers');
  const unique = [...new Set(ids.map(Number))];
  if (unique.length < 2 || unique.length > 3) throw new HttpError(400, 'Provide 2 to 3 distinct ids');

  const [rows] = await pool.query('SELECT * FROM laptops WHERE id IN (?) AND is_active = 1', [unique]);
  if (rows.length !== unique.length) throw new HttpError(404, 'One or more laptops not found');
  const items = await hydrate(rows);
  items.sort((a, b) => unique.indexOf(a.id) - unique.indexOf(b.id));
  res.json({ items });
});

exports.featured = wrap(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM laptops WHERE is_active = 1 AND stock_qty > 0 ORDER BY release_year DESC, id ASC LIMIT 6'
  );
  res.json({ items: await hydrate(rows) });
});
