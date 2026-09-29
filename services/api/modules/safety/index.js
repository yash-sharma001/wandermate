// Hasura actions: SOS. Alerts go on the event bus; the worker delivers them.
const db = require('@wandermate/common/db');
const mq = require('@wandermate/common/mq');

module.exports = {
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
