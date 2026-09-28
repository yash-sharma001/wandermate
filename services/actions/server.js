const express = require('express');
const cors = require('cors');
const db = require('@wandermate/common/db');
const redis = require('@wandermate/common/redis');
const mq = require('@wandermate/common/mq');
const formatPhone = require('@wandermate/common/phone');
const { authenticateToken } = require('@wandermate/common/auth');
const upload = require('./middleware/upload');

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'actions' }));

// ---- File uploads (multipart can't go through GraphQL): returns URLs to store via GraphQL mutations ----
app.post('/api/upload', authenticateToken, upload.any(), (req, res) => {
  res.json({ files: (req.files || []).map((f) => ({ field: f.fieldname, url: `/uploads/${f.filename}` })) });
});
app.use('/api/upload', (err, req, res, next) => res.status(400).json({ error: err.message }));
app.use('/uploads', express.static('uploads'));

// ---- Twilio (optional) ----
const sid = process.env.TWILIO_ACCOUNT_SID;
const twilio = sid && sid.startsWith('AC') && process.env.TWILIO_AUTH_TOKEN !== 'your_token'
  ? require('twilio')(sid, process.env.TWILIO_AUTH_TOKEN)
  : null;
const verifySid = process.env.TWILIO_VERIFY_SERVICE_ID;

// Max n calls per window seconds per user (Redis); fails open if Redis is down
const limit = async (userId, name, n, windowSec) => {
  let count = 0;
  try {
    const key = `rl:${name}:${userId}`;
    count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSec);
  } catch (e) {}
  if (count > n) throw new Error('Too many requests, please wait a moment');
};

const otpEmail = (otp) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
    <h2 style="color: #2D3436; text-align: center;">WanderMates Verification</h2>
    <p>Your one-time password (OTP) to verify your email address is:</p>
    <div style="background-color: #F3F4F6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #6C5CE7; border-radius: 8px;">${otp}</div>
    <p>This code will expire in 10 minutes. Please do not share this code with anyone.</p>
  </div>`;

// ---- Hasura actions ----
const handlers = {
  async sendEmailOtp({ userId }) {
    await limit(userId, 'email-otp', 3, 600);
    const [user] = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (!user) throw new Error('User not found');
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await db.query('DELETE FROM user_email_verifications WHERE user_id = $1', [userId]);
    await db.query(
      `INSERT INTO user_email_verifications (user_id, email, code, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')`,
      [userId, user.email, otp]
    );
    await mq.send('mail', { to: user.email, subject: 'Verify Your WanderMates Email', html: otpEmail(otp) });
    return { message: 'Verification code sent to your email' };
  },

  async sendPhoneOtp({ userId, input }) {
    await limit(userId, 'phone-otp', 3, 600);
    const phone = formatPhone(input.phone);
    if (!phone) throw new Error('Valid phone number is required');
    if (!twilio) throw new Error('SMS Gateway not configured');
    if (!verifySid || verifySid.startsWith('VA...')) throw new Error('Verify Service ID not configured');
    await twilio.verify.v2.services(verifySid).verifications.create({ to: phone, channel: 'sms' });
    return { message: `Verification code sent to ${phone}` };
  },

  async verifyPhoneOtp({ userId, input }) {
    const phone = formatPhone(input.phone);
    if (!phone || !input.code) throw new Error('Phone and Code are required');
    if (!twilio) throw new Error('SMS Gateway not configured');
    const check = await twilio.verify.v2.services(verifySid).verificationChecks.create({ to: phone, code: input.code });
    if (check.status !== 'approved') throw new Error('Invalid or expired verification code');
    await db.query('UPDATE users SET phone_verified = 1, trust_score = least(100, trust_score + 10) WHERE id = $1', [userId]);
    return { message: 'Phone verified successfully!' };
  },

  // What the invite link points at, shown before the user decides to join (the code is the credential)
  async groupInvitePreview({ userId, input }) {
    const [g] = await db.query(
      `SELECT g.id AS group_id, g.name, g.description, u.full_name AS creator_name,
              (SELECT count(*) FROM trip_group_members WHERE group_id = g.id)::int AS member_count,
              EXISTS (SELECT 1 FROM trip_group_members WHERE group_id = g.id AND user_id = $2) AS already_member
       FROM trip_groups g JOIN users u ON u.id = g.created_by WHERE g.invite_code = $1`,
      [String(input.code).trim(), userId]
    );
    if (!g) throw new Error('This invite link is no longer valid');
    return g;
  },

  async triggerSos({ userId, input }) {
    const { latitude, longitude } = input;
    const message = input.message || 'EMERGENCY SOS ALERT';
    await db.query(
      'INSERT INTO user_sos_alerts (user_id, latitude, longitude, message) VALUES ($1, $2, $3, $4)',
      [userId, latitude, longitude, message]
    );
    const contacts = await db.query('SELECT name, phone_number FROM user_emergency_contacts WHERE user_id = $1', [userId]);
    if (contacts.length > 0) {
      const [user] = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
      await mq.send('sos', {
        contacts,
        body: `${message}! \nFrom: ${user.email}\nLocation: https://www.google.com/maps?q=${latitude},${longitude}`,
      });
    }
    return { message: `SOS Signal Logged • Alerts queued for ${contacts.length} contact(s)` };
  },
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

// ---- Hasura event triggers (DB change -> RabbitMQ -> worker) ----
app.post('/events/wave-request', async (req, res) => {
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
    res.status(500).json({ error: e.message }); // Hasura retries per retry_conf
  }
});

app.listen(process.env.PORT || 5002, () => console.log('actions service up'));
