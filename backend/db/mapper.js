const pool = require('./pool');

function availability(stockQty) {
  if (stockQty <= 0) return 'Out of Stock';
  if (stockQty <= 5) return 'Low Stock';
  return 'In Stock';
}

const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));

// r = a laptops table row (SELECT l.*)
function toLaptop(r, useCases = []) {
  return {
    id: r.id,
    brand: r.brand,
    model: r.model,
    category: r.category,
    pricePhp: r.price_php,
    cpu: r.cpu,
    gpu: r.gpu ?? null,
    ramGb: r.ram_gb,
    storageGb: r.storage_gb,
    display: r.display ?? null,
    batteryHours: numOrNull(r.battery_hours),
    weightKg: numOrNull(r.weight_kg),
    os: r.os,
    imageUrl: r.image_url ?? null,
    summary: r.summary ?? null,
    useCases,
    stockQty: r.stock_qty,
    availability: availability(r.stock_qty),
  };
}

// Turns laptops rows into LaptopObjects (one extra query for use cases).
async function hydrate(rows) {
  if (!rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.id))];
  const [uc] = await pool.query(
    'SELECT laptop_id, use_case FROM laptop_use_cases WHERE laptop_id IN (?) ORDER BY use_case',
    [ids]
  );
  const map = new Map();
  for (const u of uc) {
    if (!map.has(u.laptop_id)) map.set(u.laptop_id, []);
    map.get(u.laptop_id).push(u.use_case);
  }
  return rows.map((r) => toLaptop(r, map.get(r.id) || []));
}

module.exports = { availability, toLaptop, hydrate };
