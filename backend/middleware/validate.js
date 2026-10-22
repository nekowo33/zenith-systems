const { HttpError } = require('./error');

// Positive integer from a number or digit-string, else null.
function toPosInt(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 1 ? v : null;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) {
    const n = Number(v);
    return n >= 1 ? n : null;
  }
  return null;
}

// Query param must be a single string.
function str(v, name) {
  if (typeof v !== 'string') throw new HttpError(400, `${name} must be a single value`);
  return v.trim();
}

// Non-negative integer query param.
function nonNegInt(v, name) {
  const s = str(v, name);
  if (!/^\d+$/.test(s)) throw new HttpError(400, `${name} must be a non-negative integer`);
  return Number(s);
}

module.exports = { toPosInt, str, nonNegInt };
