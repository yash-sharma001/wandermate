const nodemailer = require('nodemailer');
const mq = require('@wandermate/common/mq');
const formatPhone = require('@wandermate/common/phone');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const sid = process.env.TWILIO_ACCOUNT_SID;
const twilio = sid && sid.startsWith('AC') && process.env.TWILIO_AUTH_TOKEN !== 'your_token'
  ? require('twilio')(sid, process.env.TWILIO_AUTH_TOKEN)
  : null;

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

console.log('worker up');
