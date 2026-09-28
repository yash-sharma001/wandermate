const amqp = require('amqplib');

const URL = process.env.RABBITMQ_URL || 'amqp://localhost';
let chP;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Lazily connect (retrying until the broker is up); reconnects on next call after a drop.
const channel = () => {
  if (!chP) {
    chP = (async () => {
      for (;;) {
        try {
          const conn = await amqp.connect(URL);
          conn.on('error', () => {});
          conn.on('close', () => { chP = null; if (conn.fatal) process.exit(1); });
          const ch = await conn.createChannel();
          ch.conn = conn;
          return ch;
        } catch (e) {
          console.error('RabbitMQ not ready, retrying:', e.message);
          await sleep(3000);
        }
      }
    })();
  }
  return chP;
};

// Work queue: one consumer gets each message (mail, sms, chat persistence).
const send = async (queue, msg) => {
  const ch = await channel();
  await ch.assertQueue(queue, { durable: true });
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), { persistent: true });
};

// Consumers exit on connection loss so the container restarts and resubscribes.
const work = async (queue, handler) => {
  const ch = await channel();
  ch.conn.fatal = true;
  await ch.assertQueue(queue, { durable: true });
  await ch.prefetch(10);
  ch.consume(queue, async (m) => {
    if (!m) return;
    try {
      await handler(JSON.parse(m.content.toString()));
      ch.ack(m);
    } catch (e) {
      console.error(`${queue} handler failed:`, e.message);
      ch.nack(m, false, false); // ponytail: dropped, add a dead-letter queue if losing these matters
    }
  });
};

module.exports = { send, work };
