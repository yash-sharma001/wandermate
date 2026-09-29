// Twilio client, or null when not configured (SMS features then degrade gracefully)
const sid = process.env.TWILIO_ACCOUNT_SID;

module.exports = sid && sid.startsWith('AC') && process.env.TWILIO_AUTH_TOKEN !== 'your_token'
  ? require('twilio')(sid, process.env.TWILIO_AUTH_TOKEN)
  : null;
