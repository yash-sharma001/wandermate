// Event-bus consumers, run by worker.js (not by the API process)
const nodemailer = require('nodemailer');
const mq = require('@wandermate/common/mq');
const formatPhone = require('@wandermate/common/phone');
const twilio = require('../../lib/twilio');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// { to, subject, html }
mq.work('mail', (m) => transporter.sendMail({ from: process.env.EMAIL_FROM, ...m }));

// { contacts: [{ name, phone_number }], body }  -> SMS + WhatsApp per guardian
mq.work('sos', async ({ contacts, body }) => {
  if (!twilio) return console.warn('Twilio not configured, SOS SMS skipped');
  const results = await Promise.allSettled(contacts.flatMap((c) => {
    const to = formatPhone(c.phone_number);
    return [
      twilio.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to }),
      twilio.messages.create({ body, from: 'whatsapp:+14155238886', to: `whatsapp:${to}` }),
    ];
  }));
  results.filter((r) => r.status === 'rejected').forEach((r) => console.error('SOS send failed:', r.reason.message));
});
