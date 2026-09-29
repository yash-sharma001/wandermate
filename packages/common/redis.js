const Redis = require('ioredis');

// Fail fast when Redis is down (callers decide whether to fail open or closed) instead of queueing forever
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 2 });
redis.on('error', (e) => console.error('Redis error:', e.message));

module.exports = redis;
