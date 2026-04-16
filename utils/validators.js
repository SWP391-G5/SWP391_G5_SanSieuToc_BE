function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidEmail(email) {
  if (!isNonEmptyString(email)) return false;
  const e = email.trim().toLowerCase();
  if (e.length > 254) return false;
  // Simple pragmatic email validation
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function isValidUsername(username) {
  if (!isNonEmptyString(username)) return false;
  const u = username.trim();
  if (u.length < 3 || u.length > 64) return false;
  return /^[A-Za-z0-9._-]+$/.test(u);
}

function isValidPassword(password) {
  if (!isNonEmptyString(password)) return false;
  // Keep minimal, but cap to avoid abuse
  return password.length >= 6 && password.length <= 128;
}

// Vietnamese personal name (Unicode letters + spaces/hyphen/apostrophe)
function isValidName(name) {
  if (!isNonEmptyString(name)) return false;
  const n = name.trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 120) return false;
  return /^[\p{L}\p{M}]+(?:[ '-][\p{L}\p{M}]+)*$/u.test(n);
}

// Normalize VN phone to local format: 0XXXXXXXXX (10 digits) when possible.
function normalizePhone(phone) {
  if (typeof phone !== 'string') return '';
  const raw = phone.trim();
  if (!raw) return '';

  // Keep digits and leading + (if any). Remove common separators.
  const cleaned = raw.replace(/[^\d+]/g, '');
  if (!cleaned) return '';

  // Only allow '+' at first char.
  if (cleaned.includes('+') && !cleaned.startsWith('+')) return '';

  let digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;
  digits = digits.replace(/\D/g, '');

  // Convert international format 84XXXXXXXXX -> 0XXXXXXXXX
  if (digits.startsWith('84')) {
    digits = `0${digits.slice(2)}`;
  }

  return digits;
}

// VN mobile phone: 10 digits, starts with 0, common prefixes: 03/05/07/08/09
function isValidPhone(phone) {
  if (typeof phone === 'undefined' || phone === null) return true;
  if (typeof phone !== 'string') return false;

  const p = phone.trim();
  if (p.length === 0) return true;

  const digits = normalizePhone(phone);
  if (!digits) return false;

  return /^0(3|5|7|8|9)\d{8}$/.test(digits);
}

function isValidAddress(address) {
  if (typeof address === 'undefined' || address === null) return true;
  if (typeof address !== 'string') return false;
  return address.trim().length <= 200;
}

function isValidImageUrl(image) {
  if (typeof image === 'undefined' || image === null) return true;
  if (typeof image !== 'string') return false;
  const v = image.trim();
  if (v.length === 0) return true;
  if (v.length > 2000) return false;
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('data:image/') || v.startsWith('/');
}

function normalizeEmail(email) {
  return String(email).toLowerCase().trim();
}

function normalizeUsername(username) {
  return String(username).trim();
}

module.exports = {
  isNonEmptyString,
  isValidEmail,
  isValidUsername,
  isValidPassword,
  isValidName,
  isValidPhone,
  isValidAddress,
  isValidImageUrl,
  normalizeEmail,
  normalizeUsername,
  normalizePhone,
};
