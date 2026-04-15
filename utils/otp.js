const crypto = require('crypto');

function generateNumericCode(length = 6) {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

function hashOtpCode(code) {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'otp_secret_fallback';
  return crypto.createHmac('sha256', secret).update(String(code)).digest('hex');
}

function verifyOtpCode({ code, codeHash }) {
  if (!code || !codeHash) return false;
  const hashed = hashOtpCode(code);
  // Timing-safe compare
  const a = Buffer.from(hashed, 'hex');
  const b = Buffer.from(String(codeHash), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  generateNumericCode,
  hashOtpCode,
  verifyOtpCode,
};
