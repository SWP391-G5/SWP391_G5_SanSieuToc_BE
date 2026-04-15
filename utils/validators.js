function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidEmail(email) {
  if (!isNonEmptyString(email)) return false;
  const e = email.trim().toLowerCase();
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
  // Keep minimal for now
  return password.length >= 6;
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
  normalizeEmail,
  normalizeUsername,
};
