// Loads db/laptops.json into laptops + laptop_use_cases.
// Upserts by slug, so re-running never creates duplicates. Extra JSON keys are ignored.
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const CATEGORIES = ['everyday', 'work', 'gaming', 'creator', 'programming', 'chromebook', 'two_in_one', 'macbook', 'budget'];
const USE_CASES = ['school', 'office', 'creating', 'gaming', 'programming'];

// Accepts camelCase or snake_case keys from the JSON.
const pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
};
const nul = (v) => (v === undefined || v === '' ? null : v);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function main() {
  const file = path.join(__dirname, 'laptops.json');
  if (!fs.existsSync(file)) throw new Error('db/laptops.json not found');
  let data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data)) data = data.laptops || data.items || [];

  const conn = await pool.getConnection();
  let ok = 0;
  const skipped = [];
  try {
    await conn.beginTransaction();
    for (const [i, item] of data.entries()) {
      const brand = pick(item, 'brand');
      const model = pick(item, 'model');
      const category = pick(item, 'category');
      const price = pick(item, 'pricePhp', 'price_php');
      const cpu = pick(item, 'cpu');
      const ram = pick(item, 'ramGb', 'ram_gb');
      const storage = pick(item, 'storageGb', 'storage_gb');
      const os = pick(item, 'os');
      const slug = pick(item, 'slug') || (brand && model ? slugify(`${brand} ${model}`) : null);
      const label = slug || `#${i}`;

      if (!brand || !model || !slug || !cpu || !os || ram == null || storage == null || price == null) {
        skipped.push(`${label}: missing required field`); continue;
      }
      if (!CATEGORIES.includes(category)) { skipped.push(`${label}: invalid category "${category}"`); continue; }

      const imageUrl = pick(item, 'imageUrl', 'image_url') || `/images/laptops/${slug}.png`;
      const stock = pick(item, 'stockQty', 'stock_qty');
      const active = pick(item, 'isActive', 'is_active');

      const [res] = await conn.query(
        `INSERT INTO laptops
          (slug, brand, model, category, price_php, cpu, gpu, ram_gb, storage_gb, display,
           battery_hours, weight_kg, os, image_url, summary, stock_qty, release_year, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id), brand = VALUES(brand), model = VALUES(model),
           category = VALUES(category), price_php = VALUES(price_php), cpu = VALUES(cpu),
           gpu = VALUES(gpu), ram_gb = VALUES(ram_gb), storage_gb = VALUES(storage_gb),
           display = VALUES(display), battery_hours = VALUES(battery_hours),
           weight_kg = VALUES(weight_kg), os = VALUES(os), image_url = VALUES(image_url),
           summary = VALUES(summary), stock_qty = VALUES(stock_qty),
           release_year = VALUES(release_year), is_active = VALUES(is_active)`,
        [
          slug, brand, model, category, price, cpu, nul(pick(item, 'gpu')), ram, storage,
          nul(pick(item, 'display')), nul(pick(item, 'batteryHours', 'battery_hours')),
          nul(pick(item, 'weightKg', 'weight_kg')), os, imageUrl, nul(pick(item, 'summary')),
          stock === undefined ? 10 : stock, // default stock when the JSON has none
          nul(pick(item, 'releaseYear', 'release_year')),
          active === undefined ? 1 : active ? 1 : 0,
        ]
      );
      const laptopId = res.insertId;

      await conn.query('DELETE FROM laptop_use_cases WHERE laptop_id = ?', [laptopId]);
      const ucs = [...new Set(pick(item, 'useCases', 'use_cases') || [])].filter((u) => USE_CASES.includes(u));
      for (const u of ucs) {
        await conn.query('INSERT INTO laptop_use_cases (laptop_id, use_case) VALUES (?, ?)', [laptopId, u]);
      }
      ok++;
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  console.log(`Seeded ${ok} laptop(s).`);
  if (skipped.length) {
    console.warn(`Skipped ${skipped.length}:`);
    skipped.forEach((s) => console.warn(' - ' + s));
  }
  await pool.end();
}

main().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await pool.end();
  process.exit(1);
});
