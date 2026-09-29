// File uploads (multipart can't go through GraphQL): returns URLs to store via GraphQL mutations
const router = require('express').Router();
const { authenticateToken } = require('@wandermate/common/auth');
const upload = require('./upload');

router.post('/', authenticateToken, upload.any(), (req, res) => {
  res.json({ files: (req.files || []).map((f) => ({ field: f.fieldname, url: `/uploads/${f.filename}` })) });
});
router.use((err, req, res, next) => res.status(400).json({ error: err.message }));

module.exports = router;
