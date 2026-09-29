const crypto = require('crypto');
const db = require('./db');
const mq = require('./mq');

const template = (otp) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
    <h2 style="color: #2D3436; text-align: center;">WanderMates Verification</h2>
    <p>Your one-time password (OTP) to verify your email address is:</p>
    <div style="background-color: #F3F4F6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #6C5CE7; border-radius: 8px;">${otp}</div>
    <p>This code will expire in 10 minutes. Please do not share this code with anyone.</p>
  </div>`;

// Creates a 10-minute email OTP for the user (replacing any older one) and queues the mail
module.exports = async (userId) => {
  const [user] = await db.query('SELECT email FROM users WHERE id = $1', [userId]);
  if (!user) throw new Error('User not found');
  const otp = String(crypto.randomInt(100000, 1000000));
  await db.query('DELETE FROM user_email_verifications WHERE user_id = $1', [userId]);
  await db.query(
    `INSERT INTO user_email_verifications (user_id, email, code, expires_at) VALUES ($1, $2, $3, now() + interval '10 minutes')`,
    [userId, user.email, otp]
  );
  await mq.send('mail', { to: user.email, subject: 'Verify Your WanderMates Email', html: template(otp) });
};
