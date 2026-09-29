const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { v4: uuid } = require('uuid');
const db = require('@wandermate/common/db');
const redis = require('@wandermate/common/redis');
const mq = require('@wandermate/common/mq');
const sendEmailOtp = require('@wandermate/common/emailOtp');
const { verifyBearer } = require('@wandermate/common/auth');
const invalid = require('../../lib/validate');

const router = express.Router();

const ACCESS_TTL = '15m';
const REFRESH_TTL = 30 * 24 * 3600; // seconds
const RESET_TTL = 3600;
const PUBLIC_COLS = 'id, email, full_name, username, gender, profile_photo, bio, trust_score, verification_level, is_verified, role';
const cookieOpts = { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/api/auth' };

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const readCookie = (req, name) => (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];
const withRole = (user) => ({ ...user, role: user.role || 'traveler' });

const sign = (user) => jwt.sign(
  { userId: user.id, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: ACCESS_TTL, jwtid: uuid() }
);

// Short-lived access token in the body; long-lived rotating refresh token in an httpOnly cookie (only a hash is stored)
const startSession = async (user, res) => {
  const rt = crypto.randomBytes(32).toString('hex');
  await redis.multi()
    .set(`rt:${sha(rt)}`, user.id, 'EX', REFRESH_TTL)
    .sadd(`rts:${user.id}`, sha(rt))
    .expire(`rts:${user.id}`, REFRESH_TTL)
    .exec();
  res.cookie('rt', rt, { ...cookieOpts, maxAge: REFRESH_TTL * 1000 });
  return sign(user);
};

// Consume a refresh token (single use); returns the user id it belonged to, or null
const takeRefresh = async (rt) => {
  if (!rt) return null;
  const h = sha(rt);
  const uid = await redis.getdel(`rt:${h}`);
  if (uid) await redis.srem(`rts:${uid}`, h);
  return uid;
};

const revokeAllSessions = async (uid) => {
  const hashes = await redis.smembers(`rts:${uid}`);
  if (hashes.length) await redis.del(...hashes.map((h) => `rt:${h}`));
  await redis.del(`rts:${uid}`);
};

// Redis-backed guard: max 10 attempts/min per IP per route. Fails closed if Redis is down.
const limit = (name) => async (req, res, next) => {
  try {
    const key = `rl:${name}:${req.ip}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60);
    if (n > 10) return res.status(429).json({ error: 'Too many attempts, try again in a minute' });
  } catch (e) {
    return res.status(503).json({ error: 'Service temporarily unavailable' });
  }
  next();
};

const password = body('password').isLength({ min: 8 });

router.post('/register', limit('register'), [
  body('email').isEmail().normalizeEmail(),
  password,
  body('full_name').trim().isLength({ min: 2 }),
  body('username').trim().isLength({ min: 3 }).matches(/^[a-zA-Z0-9_]+$/),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer_not_to_say']),
  body('role').optional().isIn(['traveler', 'vendor', 'provider']),
], async (req, res) => {
  if (invalid(req, res)) return;

  const { email, password, full_name, username, gender, date_of_birth, role } = req.body;
  try {
    const existing = await db.query('SELECT 1 FROM users WHERE email = $1 OR username = $2 LIMIT 1', [email, username]);
    if (existing.length > 0) return res.status(400).json({ error: 'Email or username already exists' });

    const password_hash = await bcrypt.hash(password, 10);
    const [user] = await db.query(
      `INSERT INTO users (email, password_hash, full_name, username, gender, date_of_birth, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${PUBLIC_COLS}`,
      [email, password_hash, full_name, username, gender || null, date_of_birth || null, role || 'traveler']
    );

    sendEmailOtp(user.id).catch((e) => console.error('Signup verification email failed:', e.message)); // user can resend later
    res.status(201).json({ message: 'User registered successfully', token: await startSession(user, res), user: withRole(user) });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.post('/login', limit('login'), [
  body('email').notEmpty().withMessage('Email or Username is required'),
  body('password').exists(),
], async (req, res) => {
  if (invalid(req, res)) return;

  const { email, password } = req.body;
  try {
    const [user] = await db.query(
      `SELECT ${PUBLIC_COLS}, password_hash FROM users WHERE email = $1 OR username = $1 LIMIT 1`,
      [email]
    );
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await db.query('UPDATE users SET last_active = now() WHERE id = $1', [user.id]);
    delete user.password_hash;
    res.json({ message: 'Login successful', token: await startSession(user, res), user: withRole(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Trade the refresh cookie for a new access token (and a new refresh cookie)
router.post('/refresh', async (req, res) => {
  try {
    const uid = await takeRefresh(readCookie(req, 'rt'));
    const [user] = uid ? await db.query(`SELECT ${PUBLIC_COLS} FROM users WHERE id = $1`, [uid]) : [];
    if (!user) {
      res.clearCookie('rt', cookieOpts);
      return res.status(401).json({ error: 'Session expired' });
    }
    res.json({ token: await startSession(user, res), user: withRole(user) });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
});

// Logout: drop the refresh token and blacklist the access token's jti until it expires
router.post('/logout', async (req, res) => {
  try {
    await takeRefresh(readCookie(req, 'rt'));
    try {
      const t = jwt.verify((req.headers.authorization || '').split(' ')[1], process.env.JWT_SECRET, { ignoreExpiration: true });
      const ttl = t.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await redis.set(`bl:${t.jti}`, 1, 'EX', ttl);
    } catch (e) {
      if (!(e instanceof jwt.JsonWebTokenError)) throw e; // no/bad access token: nothing to blacklist
    }
    res.clearCookie('rt', cookieOpts);
    res.json({ message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(503).json({ error: 'Service temporarily unavailable' });
  }
});

// Password reset: emailed single-use link (token stored hashed in Redis, 1h)
router.post('/forgot', limit('forgot'), [body('email').isEmail().normalizeEmail()], async (req, res) => {
  if (invalid(req, res)) return;
  try {
    const [user] = await db.query('SELECT id, email FROM users WHERE email = $1', [req.body.email]);
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await redis.set(`pr:${sha(token)}`, user.id, 'EX', RESET_TTL);
      const link = `${process.env.APP_URL || 'http://localhost'}/reset-password?token=${token}`;
      await mq.send('mail', {
        to: user.email,
        subject: 'Reset your WanderMates password',
        html: `<p>Reset your password: <a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you didn't ask for it, ignore this email.</p>`,
      });
    }
    res.json({ message: 'If that email is registered, a reset link is on its way' }); // same answer either way: no account probing
  } catch (error) {
    console.error('Forgot-password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset', limit('reset'), [body('token').isHexadecimal().isLength({ min: 64, max: 64 }), password], async (req, res) => {
  if (invalid(req, res)) return;
  try {
    const uid = await redis.getdel(`pr:${sha(req.body.token)}`);
    if (!uid) return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(req.body.password, 10), uid]);
    await revokeAllSessions(uid); // sign out every device
    res.json({ message: 'Password updated. Please sign in.' });
  } catch (error) {
    console.error('Reset-password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Hasura auth webhook (GET): map a valid, non-revoked JWT to Hasura session variables
router.get('/hasura', async (req, res) => {
  try {
    const user = await verifyBearer(req.headers['authorization']);
    res.json({ 'X-Hasura-Role': 'user', 'X-Hasura-User-Id': String(user.userId) });
  } catch (e) {
    res.status(e.status || 401).json({ error: e.message });
  }
});

module.exports = router;
