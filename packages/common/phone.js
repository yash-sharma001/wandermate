// Format to E.164 (Twilio requirement); default to +91 for 10-digit Indian numbers
module.exports = (phone) => {
  if (!phone) return null;
  const cleaned = phone.toString().replace(/\D/g, '');
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
  if (phone.toString().startsWith('+')) return phone;
  return `+${cleaned}`;
};
