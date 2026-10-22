const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { HttpError, wrap } = require('../middleware/error');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sign = (u) => jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u.id, fullName: u.full_name, email: u.email });

exports.register = wrap(async (req, res) => {
  const { fullName, email, password } = req.body || {};
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.trim().length > 100)
    throw new HttpError(400, 'fullName is required (max 100 characters)');
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.trim().length > 255)
    throw new HttpError(400, 'A valid email is required');
  if (typeof password !== 'string' || password.length < 8 || password.length > 72)
    throw new HttpError(400, 'password must be 8 to 72 characters');

  const cleanEmail = email.trim().toLowerCase();
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
  if (existing.length) throw new HttpError(409, 'Email already registered');

  const hash = await bcrypt.hash(password, 10);
  let result;
  try {
    [result] = await pool.query('INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)', [
      fullName.trim(), cleanEmail, hash,
    ]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Email already registered');
    throw err;
  }
  const user = { id: result.insertId, full_name: fullName.trim(), email: cleanEmail };
  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

exports.login = wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password)
    throw new HttpError(400, 'email and password are required');

  const [rows] = await pool.query('SELECT id, full_name, email, password_hash FROM users WHERE email = ?', [
    email.trim().toLowerCase(),
  ]);
  const user = rows[0];
  const valid = user && (await bcrypt.compare(password, user.password_hash));
  if (!valid) throw new HttpError(401, 'Invalid email or password');
  res.json({ token: sign(user), user: publicUser(user) });
});

exports.me = wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT id, full_name, email FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) throw new HttpError(401, 'User no longer exists');
  res.json({ user: publicUser(rows[0]) });
});
