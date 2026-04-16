const AdminAccount = require('../../models/AdminAccount');
const { verifyPassword, hashPassword, generateRandomPassword } = require('../../utils/password');
const { signAccessToken } = require('../../utils/jwt');
const { sendNewPasswordEmail } = require('../../utils/mailer');
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

  if (!account || account.status !== 'Active') {
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

  const user = normalizeAccount(account);
  const accessToken = signAccessToken({ sub: String(account._id), accountType: 'admin', role: roleName });

  return { status: 200, body: { accessToken, user } };
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
  forgotPassword,
};
