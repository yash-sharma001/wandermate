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
    throw { status: 403, message: 'Invalid or expired token' };
  }
  try {
    if (user.jti && await redis.exists(`bl:${user.jti}`)) throw { status: 401, message: 'Token revoked' };
  } catch (e) {
    if (e.status) throw e; // Redis down: fail open, the signature was still verified
  }
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
