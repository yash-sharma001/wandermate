const redis = require('@wandermate/common/redis');

// Max n calls per window seconds per key (Redis). Fails closed: if Redis is down the call errors.
module.exports = async (key, name, n, windowSec) => {
  const k = `rl:${name}:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, windowSec);
  if (count > n) throw Object.assign(new Error('Too many requests, please wait a moment'), { status: 429 });
};
