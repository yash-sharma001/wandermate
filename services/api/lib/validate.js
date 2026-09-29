const { validationResult } = require('express-validator');

// Sends the 400 and returns true when express-validator found errors
module.exports = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ errors: errors.array() });
  return true;
};
