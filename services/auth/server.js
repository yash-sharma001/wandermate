const express = require('express');
const cors = require('cors');

const app = express();
app.set('trust proxy', true); // behind the gateway: req.ip is the real client
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth' }));
app.use('/api/auth', require('./routes'));

app.listen(process.env.PORT || 5001, () => console.log('auth service up'));
