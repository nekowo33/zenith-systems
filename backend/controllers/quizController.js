const pool = require('../db/pool');
const { hydrate } = require('../db/mapper');
const { HttpError, wrap } = require('../middleware/error');

const USES = ['school', 'office', 'creating', 'gaming', 'programming'];
const PORTABILITY = ['desk', 'carry', 'both'];
const PRIORITIES = ['battery', 'power', 'light', 'screen', 'price'];
const BRANDS = ['Acer', 'Lenovo', 'MSI', 'Razer', 'Apple', 'any'];

// Ordered cheapest -> priciest. Boundaries follow the spec literally and never overlap.
const TIERS = ['under30k', '30to50k', '50to80k', '80kplus'];
const inTier = (tier, p) => {
  switch (tier) {
    case 'under30k': return p < 30000;
    case '30to50k': return p >= 30000 && p <= 50000;
    case '50to80k': return p > 50000 && p <= 80000;
    default: return p > 80000;
  }
};

// Relaxing the budget by one tier = also allow the next tier up (the next one down for 80kplus).
const relaxedTier = (tier) => {
  const i = TIERS.indexOf(tier);
  return i < TIERS.length - 1 ? TIERS[i + 1] : TIERS[i - 1];
};

// nulls always sort last
const cmpNum = (a, b, dir) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === 'asc' ? a - b : b - a;
};

const PRIORITY_SORT = {
  battery: (a, b) => cmpNum(a.batteryHours, b.batteryHours, 'desc'),
  power: (a, b) => cmpNum(a.ramGb, b.ramGb, 'desc') || cmpNum(a.pricePhp, b.pricePhp, 'desc'),
  light: (a, b) => cmpNum(a.weightKg, b.weightKg, 'asc'),
  screen: () => 0, // keep default order
  price: (a, b) => cmpNum(a.pricePhp, b.pricePhp, 'asc'),
};

function buildReason(l, { use, priority, brand }) {
  const bits = [];
  if (priority === 'battery' && l.batteryHours != null) bits.push(`up to ${l.batteryHours} hours of battery life`);
  if (priority === 'power') bits.push(`${l.ramGb}GB of RAM and a ${l.cpu} processor`);
  if (priority === 'light' && l.weightKg != null) bits.push(`a light ${l.weightKg} kg body`);
  if (priority === 'screen' && l.display) bits.push(`a ${l.display} display`);
  if (priority === 'price') bits.push(`a friendly price of PHP ${l.pricePhp.toLocaleString('en-PH')}`);
  if (brand !== 'any' && l.brand === brand) bits.push(`the ${brand} brand you asked for`);
  return bits.length
    ? `A good fit for ${use} with ${bits.join(' and ')}.`
    : `A good fit for ${use} within your budget.`;
}

exports.recommend = wrap(async (req, res) => {
  const { use, portability, budget, priority, brand } = req.body || {};
  if (!USES.includes(use)) throw new HttpError(400, `use must be one of: ${USES.join(', ')}`);
  if (!PORTABILITY.includes(portability)) throw new HttpError(400, `portability must be one of: ${PORTABILITY.join(', ')}`);
  if (!TIERS.includes(budget)) throw new HttpError(400, `budget must be one of: ${TIERS.join(', ')}`);
  if (!PRIORITIES.includes(priority)) throw new HttpError(400, `priority must be one of: ${PRIORITIES.join(', ')}`);
  if (!BRANDS.includes(brand)) throw new HttpError(400, `brand must be one of: ${BRANDS.join(', ')}`);

  const [rows] = await pool.query(
    `SELECT l.* FROM laptops l
     WHERE l.is_active = 1 AND l.stock_qty > 0
       AND EXISTS (SELECT 1 FROM laptop_use_cases u WHERE u.laptop_id = l.id AND u.use_case = ?)
     ORDER BY l.id ASC`,
    [use]
  );
  const all = await hydrate(rows);

  let candidates = all.filter((l) => inTier(budget, l.pricePhp));
  if (candidates.length < 3) {
    const extra = relaxedTier(budget);
    candidates = all.filter((l) => inTier(budget, l.pricePhp) || inTier(extra, l.pricePhp));
  }

  const score = (l) =>
    (inTier(budget, l.pricePhp) ? 4 : 0) + // in-budget picks always come before relaxed ones
    (portability === 'carry' && l.weightKg != null && l.weightKg < 1.6 ? 2 : 0) +
    (brand !== 'any' && l.brand === brand ? 1 : 0);

  const ranked = candidates
    .map((l, i) => ({ l, i, s: score(l) }))
    .sort((a, b) => b.s - a.s || PRIORITY_SORT[priority](a.l, b.l) || a.i - b.i)
    .slice(0, 3);

  res.json({
    matches: ranked.map((r, idx) => ({
      rank: idx + 1,
      laptop: r.l,
      reason: buildReason(r.l, { use, priority, brand }),
    })),
  });
});
