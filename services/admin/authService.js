const AdminAccount = require('../../models/AdminAccount');
const { verifyPassword, hashPassword, generateRandomPassword } = require('../../utils/password');
const { signAccessToken } = require('../../utils/jwt');
const { isEmailConfigured, sendNewPasswordEmail, sendVerificationCodeEmail } = require('../../utils/mailer');
const { generateNumericCode, hashOtpCode, verifyOtpCode } = require('../../utils/otp');
const {
  isNonEmptyString,
  isValidEmail,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
} = require('../../utils/validators');

const ALLOWED_ROLES = ['Admin', 'Manager'];

function roleKey(roleName) {
  return String(roleName || '').trim().toLowerCase();
}

function normalizeAccount(accountDoc) {
  return {
    id: accountDoc._id,
    username: accountDoc.username,
    email: accountDoc.email,
    name: accountDoc.name,
    image: accountDoc.image || '',
    role: accountDoc.roleID?.name,
    accountType: 'admin',
  };
}

function isVerifiedAdmin(accountDoc) {
  // Backward compatible: missing field means verified.
  return accountDoc?.emailVerified !== false;
}

async function issueAndSendVerificationCode(accountDoc) {
  if (!isEmailConfigured()) {
    return { ok: false, status: 500, message: 'Chức năng gửi email chưa được cấu hình.' };
  }

  const now = Date.now();
  const resendAt = accountDoc.emailVerification?.resendAvailableAt;
  if (resendAt && resendAt.getTime() > now) {
    return { ok: true, throttled: true };
  }

  const code = generateNumericCode(6);
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(now + 5 * 60 * 1000);
  const resendAvailableAt = new Date(now + 60 * 1000);

  accountDoc.emailVerification = {
    codeHash,
    expiresAt,
    resendAvailableAt,
  };
  await accountDoc.save();

  await sendVerificationCodeEmail({ to: accountDoc.email, name: accountDoc.name, code });
  return { ok: true, throttled: false };
}

async function login(payload) {
  const { username, emailOrUsername, password, role } = payload || {};
  const rawUsername = isNonEmptyString(username) ? username : emailOrUsername;

  if (!isNonEmptyString(rawUsername) || !isNonEmptyString(password)) {
    return { status: 400, body: { message: 'Vui lòng nhập username và mật khẩu.' } };
  }

  const normalizedUsername = normalizeUsername(rawUsername);
  if (!isValidUsername(normalizedUsername)) {
    return { status: 400, body: { message: 'Username không hợp lệ.' } };
  }

  const account = await AdminAccount.findOne({ username: normalizedUsername }).populate('roleID');

  if (!account || account.status === 'Deleted') {
    return { status: 401, body: { message: 'Sai username hoặc mật khẩu.' } };
  }

  const ok = await verifyPassword(String(password), account.password);
  if (!ok) {
    return { status: 401, body: { message: 'Sai username hoặc mật khẩu.' } };
  }

  const roleName = account.roleID?.name;
  if (!roleName || !ALLOWED_ROLES.map(roleKey).includes(roleKey(roleName))) {
    return { status: 403, body: { message: 'Bạn không có quyền truy cập.' } };
  }

  if (isNonEmptyString(role)) {
    const requestedRole = String(role).trim();
    if (!ALLOWED_ROLES.map(roleKey).includes(roleKey(requestedRole))) {
      return { status: 400, body: { message: 'Vai trò đăng nhập không hợp lệ.' } };
    }
    if (roleKey(roleName) !== roleKey(requestedRole)) {
      return { status: 403, body: { message: 'Sai username hoặc mật khẩu.' } };
    }
  }

  // First-login OTP verification gate
  if (!isVerifiedAdmin(account)) {
    try {
      await issueAndSendVerificationCode(account);
    } catch {
      return { status: 500, body: { message: 'Gửi mã xác thực thất bại. Vui lòng thử lại sau.' } };
    }
    return {
      status: 403,
      body: { message: 'Tài khoản chưa được xác thực email.', email: account.email },
    };
  }

  if (account.status !== 'Active') {
    return { status: 403, body: { message: 'Tài khoản đã bị vô hiệu hóa.' } };
  }

  const user = normalizeAccount(account);
  const accessToken = signAccessToken({ sub: String(account._id), accountType: 'admin', role: roleName });

  return { status: 200, body: { accessToken, user } };
}

async function verifyEmail(payload) {
  const { email, code } = payload || {};

  if (!isNonEmptyString(email) || !isNonEmptyString(code)) {
    return { status: 400, body: { message: 'Vui lòng nhập email và mã xác thực.' } };
  }
  if (!isValidEmail(email)) {
    return { status: 400, body: { message: 'Email không hợp lệ.' } };
  }

  const normalizedEmail = normalizeEmail(email);
  const account = await AdminAccount.findOne({ email: normalizedEmail }).populate('roleID');
  if (!account) {
    return { status: 400, body: { message: 'Mã xác thực không đúng hoặc đã hết hạn.' } };
  }

  if (account.status === 'Deleted') {
    return { status: 403, body: { message: 'Tài khoản đã bị vô hiệu hóa.' } };
  }

  if (isVerifiedAdmin(account)) {
    if (account.status !== 'Active') {
      return { status: 403, body: { message: 'Tài khoản đã bị vô hiệu hóa.' } };
    }
    const roleName = account.roleID?.name;
    if (!roleName || !ALLOWED_ROLES.map(roleKey).includes(roleKey(roleName))) {
      return { status: 403, body: { message: 'Bạn không có quyền truy cập.' } };
    }

    const user = normalizeAccount(account);
    const accessToken = signAccessToken({ sub: String(account._id), accountType: 'admin', role: roleName });
    return { status: 200, body: { accessToken, user } };
  }

  const exp = account.emailVerification?.expiresAt;
  const codeHash = account.emailVerification?.codeHash;
  if (!exp || !codeHash || exp.getTime() < Date.now()) {
    return { status: 400, body: { message: 'Mã xác thực không đúng hoặc đã hết hạn.' } };
  }

  const ok = verifyOtpCode({ code: String(code).trim(), codeHash });
  if (!ok) {
    return { status: 400, body: { message: 'Mã xác thực không đúng hoặc đã hết hạn.' } };
  }

  account.emailVerified = true;
  account.status = 'Active';
  account.emailVerification = { codeHash: '', expiresAt: undefined, resendAvailableAt: undefined };
  await account.save();

  const roleName = account.roleID?.name;
  if (!roleName || !ALLOWED_ROLES.map(roleKey).includes(roleKey(roleName))) {
    return { status: 403, body: { message: 'Bạn không có quyền truy cập.' } };
  }

  const user = normalizeAccount(account);
  const accessToken = signAccessToken({ sub: String(account._id), accountType: 'admin', role: roleName });
  return { status: 200, body: { accessToken, user } };
}

async function resendVerification(payload) {
  const { email } = payload || {};

  if (!isNonEmptyString(email)) {
    return { status: 400, body: { message: 'Vui lòng nhập email.' } };
  }
  if (!isValidEmail(email)) {
    return { status: 400, body: { message: 'Email không hợp lệ.' } };
  }
  if (!isEmailConfigured()) {
    return { status: 500, body: { message: 'Chức năng gửi email chưa được cấu hình.' } };
  }

  const normalizedEmail = normalizeEmail(email);
  const account = await AdminAccount.findOne({ email: normalizedEmail });
  if (!account) {
    return { status: 200, body: { message: 'Nếu email tồn tại, mã xác thực đã được gửi.' } };
  }

  if (isVerifiedAdmin(account)) {
    return { status: 400, body: { message: 'Tài khoản đã được xác thực.' } };
  }
  if (account.status === 'Deleted') {
    return { status: 403, body: { message: 'Tài khoản đã bị vô hiệu hóa.' } };
  }

  const now = Date.now();
  const resendAt = account.emailVerification?.resendAvailableAt;
  if (resendAt && resendAt.getTime() > now) {
    const seconds = Math.ceil((resendAt.getTime() - now) / 1000);
    return { status: 429, body: { message: `Vui lòng chờ ${seconds} giây để gửi lại mã.` } };
  }

  const code = generateNumericCode(6);
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(now + 5 * 60 * 1000);
  const resendAvailableAt = new Date(now + 60 * 1000);

  account.emailVerification = {
    codeHash,
    expiresAt,
    resendAvailableAt,
  };
  await account.save();

  try {
    await sendVerificationCodeEmail({ to: account.email, name: account.name, code });
  } catch (e) {
    return { status: 500, body: { message: 'Gửi mã xác thực thất bại. Vui lòng thử lại sau.' } };
  }

  return { status: 200, body: { message: 'Mã xác thực đã được gửi lại về email.' } };
}

async function forgotPassword(payload) {
  const { email } = payload || {};

  if (!isNonEmptyString(email)) {
    return { status: 200, body: { message: 'Nếu email tồn tại, mật khẩu mới đã được gửi.' } };
  }

  if (!isValidEmail(email)) {
    return { status: 200, body: { message: 'Nếu email tồn tại, mật khẩu mới đã được gửi.' } };
  }

  const normalizedEmail = normalizeEmail(email);
  const account = await AdminAccount.findOne({ email: normalizedEmail }).populate('roleID');

  if (account && account.status === 'Active') {
    const roleName = account.roleID?.name;
    if (roleName && ALLOWED_ROLES.map(roleKey).includes(roleKey(roleName))) {
      const newPassword = generateRandomPassword(12);
      account.password = await hashPassword(newPassword);
      await account.save();

      try {
        await sendNewPasswordEmail({ to: account.email, name: account.name, newPassword });
      } catch (e) {
        // Intentionally swallow to avoid leaking info.
      }
    }
  }

  return { status: 200, body: { message: 'Nếu email tồn tại, mật khẩu mới đã được gửi.' } };
}

module.exports = {
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
};
