const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuid } = require('uuid');
const db = require('@wandermate/common/db');
const redis = require('@wandermate/common/redis');
const { verifyBearer, authenticateToken } = require('@wandermate/common/auth');

const router = express.Router();

const sign = (user) => jwt.sign(
  { userId: user.id, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: '7d', jwtid: uuid() }
);

// Redis-backed brute-force guard: max 10 login attempts/min per IP
const loginLimit = async (req, res, next) => {
  try {
    const key = `rl:login:${req.ip}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60);
    if (n > 10) return res.status(429).json({ error: 'Too many login attempts, try again in a minute' });
  } catch (e) {} // Redis down: fail open
  next();
};

router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('full_name').trim().isLength({ min: 2 }),
  body('username').trim().isLength({ min: 3 }).matches(/^[a-zA-Z0-9_]+$/),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer_not_to_say']),
  body('role').optional().isIn(['traveler', 'vendor', 'provider']),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, full_name, username, gender, date_of_birth, role } = req.body;
  try {
    const existing = await db.query('SELECT 1 FROM users WHERE email = $1 OR username = $2 LIMIT 1', [email, username]);
    if (existing.length > 0) return res.status(400).json({ error: 'Email or username already exists' });

    const password_hash = await bcrypt.hash(password, 10);
    const [user] = await db.query(
      `INSERT INTO users (email, password_hash, full_name, username, gender, date_of_birth, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, full_name, username, gender, trust_score, role`,
      [email, password_hash, full_name, username, gender || null, date_of_birth || null, role || 'traveler']
    );

    res.status(201).json({ message: 'User registered successfully', token: sign(user), user });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', loginLimit, [
  body('email').notEmpty().withMessage('Email or Username is required'),
  body('password').exists(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    const [user] = await db.query(
      `SELECT id, email, password_hash, full_name, username, gender, profile_photo, bio,
              trust_score, verification_level, is_verified, role
       FROM users WHERE email = $1 OR username = $1 LIMIT 1`,
      [email]
    );
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.query('UPDATE users SET last_active = now() WHERE id = $1', [user.id]);
    delete user.password_hash;
    res.json({ message: 'Login successful', token: sign(user), user: { ...user, role: user.role || 'traveler' } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Logout: blacklist the token's jti until it expires
router.post('/logout', authenticateToken, async (req, res) => {
  const ttl = req.user.exp - Math.floor(Date.now() / 1000);
  if (req.user.jti && ttl > 0) await redis.set(`bl:${req.user.jti}`, 1, 'EX', ttl);
  res.json({ message: 'Logged out' });
});

// Hasura auth webhook (GET): map a valid, non-revoked JWT to Hasura session variables
router.get('/hasura', async (req, res) => {
  try {
    const user = await verifyBearer(req.headers['authorization']);
    res.json({ 'X-Hasura-Role': 'user', 'X-Hasura-User-Id': String(user.userId) });
  } catch (e) {
    res.status(401).json({ error: e.message });
  }
});

module.exports = router;
