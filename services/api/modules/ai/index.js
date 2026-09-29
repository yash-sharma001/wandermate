// Synchronous calls to the Python AI service, for things the user waits on
const router = require('express').Router();
const { body } = require('express-validator');
const { authenticateToken } = require('@wandermate/common/auth');
const limit = require('../../lib/limit');
const invalid = require('../../lib/validate');

const AI_URL = process.env.AI_URL || 'http://ai:8000';

router.post('/itinerary', authenticateToken, [
  body('destination').trim().isLength({ min: 2, max: 100 }),
  body('days').isInt({ min: 1, max: 14 }).toInt(),
  body('interests').optional().isArray({ max: 10 }),
  body('budget').optional().isIn(['low', 'mid', 'high']),
], async (req, res) => {
  if (invalid(req, res)) return;
  try {
    await limit(req.user.userId, 'ai-itinerary', 5, 60);
    const { destination, days, interests, budget } = req.body;
    const r = await fetch(`${AI_URL}/itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination, days, interests, budget }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Object.assign(new Error(`AI service returned ${r.status}`), { status: 502 });
    res.json(await r.json());
  } catch (e) {
    console.error('Itinerary error:', e.message);
    res.status(e.status || 503).json({ error: e.status === 429 ? e.message : 'Itinerary service unavailable' });
  }
});

module.exports = router;
