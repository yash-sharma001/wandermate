const jwt = require('jsonwebtoken');
const redis = require('./redis');

// Verify a bearer token and check it hasn't been logged out (Redis blacklist by jti).
// Returns the decoded payload or throws { status, message }.
const verifyBearer = async (header) => {
  const token = header && header.split(' ')[1];
  if (!token) throw { status: 401, message: 'Access token required' };

  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    throw { status: 401, message: 'Invalid or expired token' };
  }
  let revoked;
  try {
    revoked = await redis.exists(`bl:${user.jti}`);
  } catch (e) {
    throw { status: 503, message: 'Auth temporarily unavailable' }; // Redis down: fail closed, can't rule out a logout
  }
  if (revoked) throw { status: 401, message: 'Token revoked' };
  return user;
};

const authenticateToken = async (req, res, next) => {
  try {
    req.user = await verifyBearer(req.headers['authorization']);
    next();
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
};

module.exports = { verifyBearer, authenticateToken };
