// Second process of the same codebase: consumes the async queues (mail, sos) published by the API.
require('./modules/notifications/consumers');
console.log('worker up');
