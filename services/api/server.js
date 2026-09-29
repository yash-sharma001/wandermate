// WanderMates modular monolith: one Express app, one folder per domain under modules/.
// Modules either mount a router (REST) or export Hasura action handlers; nothing imports another module.
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change_me')) {
  console.error('JWT_SECRET must be set to a real secret');
  process.exit(1);
}

const app = express();
app.set('trust proxy', true); // behind the gateway: req.ip is the real client
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true, credentials: true })); // set CORS_ORIGIN in prod
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api' }));

// ---- Public REST (through the gateway) ----
app.use('/api/auth', require('./modules/auth/routes'));
app.use('/api/upload', require('./modules/uploads'));
app.use('/api/ai', require('./modules/ai'));
app.use('/uploads', express.static('uploads'));

// ---- Internal: called by Hasura only (not routed by the gateway) ----
const handlers = {
  ...require('./modules/verification'),
  ...require('./modules/safety'),
  ...require('./modules/groups'),
};

app.post('/actions', async (req, res) => {
  const { action, input, session_variables: s } = req.body;
  try {
    const handler = handlers[action.name];
    if (!handler) return res.status(400).json({ message: `Unknown action ${action.name}` });
    res.json(await handler({ userId: Number(s['x-hasura-user-id']), input }));
  } catch (e) {
    console.error(`Action ${action.name} failed:`, e.message);
    res.status(400).json({ message: e.message });
  }
});

app.use('/events', require('./modules/notifications/events'));

app.listen(process.env.PORT || 5000, () => console.log('api up'));
