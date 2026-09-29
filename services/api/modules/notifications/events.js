// Hasura event triggers (DB change -> event bus). Called by Hasura, retried by it on non-2xx.
const router = require('express').Router();
const db = require('@wandermate/common/db');
const mq = require('@wandermate/common/mq');

router.post('/wave-request', async (req, res) => {
  try {
    const r = req.body.event.data.new;
    const [row] = await db.query(
      `SELECT hu.email, w.origin_name, w.destination_name, ru.full_name
       FROM waves w JOIN users hu ON hu.id = w.host_id JOIN users ru ON ru.id = $2
       WHERE w.id = $1`,
      [r.wave_id, r.requester_id]
    );
    if (row) {
      await mq.send('mail', {
        to: row.email,
        subject: 'New ride request on WanderMates',
        html: `<p><b>${row.full_name}</b> asked to join your wave ${row.origin_name} → ${row.destination_name} (${r.seats_requested} seat(s)). Open WanderMates to approve or reject.</p>`,
      });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('wave-request event failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
