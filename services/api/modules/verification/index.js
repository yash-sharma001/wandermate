// Hasura actions: email + phone OTP verification
const db = require('@wandermate/common/db');
const formatPhone = require('@wandermate/common/phone');
const sendEmailOtp = require('@wandermate/common/emailOtp');
const limit = require('../../lib/limit');
const twilio = require('../../lib/twilio');

const verifySid = process.env.TWILIO_VERIFY_SERVICE_ID;

module.exports = {
  async sendEmailOtp({ userId }) {
    await limit(userId, 'email-otp', 3, 600);
    await sendEmailOtp(userId);
    return { message: 'Verification code sent to your email' };
  },

  // 5 guesses per 10 minutes: a 6-digit code can't be brute-forced within its lifetime
  async verifyEmailOtp({ userId, input }) {
    await limit(userId, 'email-verify', 5, 600);
    const [v] = await db.query(
      'SELECT email FROM user_email_verifications WHERE user_id = $1 AND code = $2 AND expires_at > now()',
      [userId, String(input.code).trim()]
    );
    if (!v) throw new Error('Invalid or expired verification code');
    await db.query('UPDATE users SET email_verified = 1, trust_score = least(100, trust_score + 10) WHERE id = $1 AND email = $2', [userId, v.email]);
    await db.query('DELETE FROM user_email_verifications WHERE user_id = $1', [userId]);
    return { message: 'Email verified successfully!' };
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
};
