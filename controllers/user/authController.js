const UserAccount = require('../../models/UserAccount');
const Role = require('../../models/Role');
const { verifyPassword, hashPassword, generateRandomPassword } = require('../../utils/password');
const { signAccessToken } = require('../../utils/jwt');
const { isEmailConfigured, sendNewPasswordEmail, sendVerificationCodeEmail } = require('../../utils/mailer');
const { generateNumericCode, hashOtpCode, verifyOtpCode } = require('../../utils/otp');
const {
  isNonEmptyString,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
} = require('../../utils/validators');

const ALLOWED_LOGIN_ROLES = ['Owner', 'Customer'];

function roleKey(roleName) {
  return String(roleName || '').trim().toLowerCase();
}

function normalizeAccount(accountDoc) {
  return {
    id: accountDoc._id,
    username: accountDoc.username,
    email: accountDoc.email,
    name: accountDoc.name,
    role: accountDoc.roleID?.name,
    accountType: 'user',
  };
}

async function login(req, res) {
  const { username, emailOrUsername, password, role } = req.body || {};
  const rawUsername = isNonEmptyString(username) ? username : emailOrUsername;

  if (!isNonEmptyString(rawUsername) || !isNonEmptyString(password)) {
    return res.status(400).json({ message: 'Vui lòng nhập username và mật khẩu.' });
  }

  const normalizedUsername = normalizeUsername(rawUsername);
  if (!isValidUsername(normalizedUsername)) {
    return res.status(400).json({ message: 'Username không hợp lệ.' });
  }

  const account = await UserAccount.findOne({ username: normalizedUsername }).populate('roleID');

  if (!account) {
    return res.status(401).json({ message: 'Sai username hoặc mật khẩu.' });
  }

  const ok = await verifyPassword(String(password), account.password);
  if (!ok) {
    return res.status(401).json({ message: 'Sai username hoặc mật khẩu.' });
  }

  if (account.status === 'Banned') {
    return res.status(403).json({ message: 'Tài khoản đã bị khóa.' });
  }

  if (account.status !== 'Active') {
    if (!account.emailVerified) {
      return res.status(403).json({
        message: 'Tài khoản chưa được xác thực email.',
        email: account.email,
      });
    }
    return res.status(403).json({ message: 'Tài khoản đã bị vô hiệu hóa.' });
  }

  if (!account.emailVerified) {
    return res.status(403).json({
      message: 'Tài khoản chưa được xác thực email.',
      email: account.email,
    });
  }

  const roleName = account.roleID?.name;
  if (!roleName || !ALLOWED_LOGIN_ROLES.map(roleKey).includes(roleKey(roleName))) {
    return res.status(403).json({ message: 'Bạn không có quyền truy cập.' });
  }

  if (isNonEmptyString(role)) {
    const requestedRole = String(role).trim();
    if (!ALLOWED_LOGIN_ROLES.map(roleKey).includes(roleKey(requestedRole))) {
      return res.status(400).json({ message: 'Vai trò đăng nhập không hợp lệ.' });
    }
    if (roleKey(roleName) !== roleKey(requestedRole)) {
      return res.status(403).json({ message: 'Sai username hoặc mật khẩu.' });
    }
  }

  const user = normalizeAccount(account);
  const accessToken = signAccessToken({ sub: String(account._id), accountType: 'user', role: roleName });

  return res.json({ accessToken, user });
}

async function registerCustomer(req, res) {
  const { name, email, username, password } = req.body || {};

  if (!isNonEmptyString(name) || !isNonEmptyString(email) || !isNonEmptyString(username) || !isNonEmptyString(password)) {
    return res.status(400).json({ message: 'Vui lòng nhập đầy đủ họ tên, email, username và mật khẩu.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ message: 'Username không hợp lệ.' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ message: 'Mật khẩu phải có ít nhất 6 ký tự.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);

  const existing = await UserAccount.findOne({
    $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
  });

  if (existing) {
    return res.status(409).json({ message: 'Email hoặc username đã tồn tại.' });
  }

  let role = await Role.findOne({ name: /^Customer$/i });
  if (!role) {
    role = await Role.create({ name: 'Customer' });
  }

  if (!isEmailConfigured()) {
    return res.status(500).json({ message: 'Chức năng gửi email chưa được cấu hình.' });
  }

  const passwordHash = await hashPassword(String(password));

  const verificationCode = generateNumericCode(6);
  const verificationCodeHash = hashOtpCode(verificationCode);
  const now = Date.now();
  const expiresAt = new Date(now + 5 * 60 * 1000);
  const resendAvailableAt = new Date(now + 60 * 1000);

  const account = await UserAccount.create({
    name: String(name).trim(),
    email: normalizedEmail,
    username: normalizedUsername,
    password: passwordHash,
    roleID: role._id,
    status: 'InActive',
    emailVerified: false,
    emailVerification: {
      codeHash: verificationCodeHash,
      expiresAt,
      resendAvailableAt,
    },
  });

  try {
    await sendVerificationCodeEmail({ to: normalizedEmail, name: String(name).trim(), code: verificationCode });
  } catch (e) {
    // If email sending fails, rollback created account to avoid leaving a disabled account behind.
    try {
      await UserAccount.deleteOne({ _id: account._id });
    } catch {
      // ignore
    }
    return res.status(500).json({ message: 'Gửi mã xác thực thất bại. Vui lòng thử lại sau.' });
  }

  return res.status(202).json({
    message: 'Đăng ký chưa hoàn tất (chưa thành công). Vui lòng nhập mã xác thực đã được gửi về email để hoàn tất đăng ký.',
    email: normalizedEmail,
    pendingVerification: true,
  });
}

async function verifyEmail(req, res) {
  const { email, code } = req.body || {};

  if (!isNonEmptyString(email) || !isNonEmptyString(code)) {
    return res.status(400).json({ message: 'Vui lòng nhập email và mã xác thực.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }
  const normalizedEmail = normalizeEmail(email);

  const account = await UserAccount.findOne({ email: normalizedEmail }).populate('roleID');
  if (!account) {
    return res.status(400).json({ message: 'Mã xác thực không đúng hoặc đã hết hạn.' });
  }

  if (account.emailVerified) {
    if (account.status === 'Banned') {
      return res.status(403).json({ message: 'Tài khoản đã bị khóa.' });
    }
    if (account.status !== 'Active') {
      return res.status(403).json({ message: 'Tài khoản đã bị vô hiệu hóa.' });
    }
    const roleName = account.roleID?.name;
    const user = normalizeAccount(account);
    const accessToken = signAccessToken({ sub: String(account._id), accountType: 'user', role: roleName });
    return res.status(200).json({ accessToken, user });
  }

  if (account.status === 'Banned') {
    return res.status(403).json({ message: 'Tài khoản đã bị khóa.' });
  }

  const exp = account.emailVerification?.expiresAt;
  const codeHash = account.emailVerification?.codeHash;
  if (!exp || !codeHash || exp.getTime() < Date.now()) {
    return res.status(400).json({ message: 'Mã xác thực không đúng hoặc đã hết hạn.' });
  }

  const ok = verifyOtpCode({ code: String(code).trim(), codeHash });
  if (!ok) {
    return res.status(400).json({ message: 'Mã xác thực không đúng hoặc đã hết hạn.' });
  }

  account.emailVerified = true;
  account.status = 'Active';
  account.emailVerification = { codeHash: '', expiresAt: undefined, resendAvailableAt: undefined };
  await account.save();

  const roleName = account.roleID?.name;
  const user = normalizeAccount(account);
  const accessToken = signAccessToken({ sub: String(account._id), accountType: 'user', role: roleName });

  return res.status(200).json({ accessToken, user });
}

async function resendVerification(req, res) {
  const { email } = req.body || {};

  if (!isNonEmptyString(email)) {
    return res.status(400).json({ message: 'Vui lòng nhập email.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }
  if (!isEmailConfigured()) {
    return res.status(500).json({ message: 'Chức năng gửi email chưa được cấu hình.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const account = await UserAccount.findOne({ email: normalizedEmail });
  if (!account) {
    return res.status(200).json({ message: 'Nếu email tồn tại, mã xác thực đã được gửi.' });
  }

  if (account.emailVerified) {
    return res.status(400).json({ message: 'Tài khoản đã được xác thực.' });
  }

  if (account.status === 'Banned') {
    return res.status(403).json({ message: 'Tài khoản đã bị khóa.' });
  }
  if (account.status !== 'Active' && account.status !== 'InActive') {
    return res.status(403).json({ message: 'Tài khoản đã bị vô hiệu hóa.' });
  }

  const now = Date.now();
  const resendAt = account.emailVerification?.resendAvailableAt;
  if (resendAt && resendAt.getTime() > now) {
    const seconds = Math.ceil((resendAt.getTime() - now) / 1000);
    return res.status(429).json({ message: `Vui lòng chờ ${seconds} giây để gửi lại mã.` });
  }

  const verificationCode = generateNumericCode(6);
  const verificationCodeHash = hashOtpCode(verificationCode);
  const expiresAt = new Date(now + 5 * 60 * 1000);
  const resendAvailableAt = new Date(now + 60 * 1000);

  account.emailVerification = {
    codeHash: verificationCodeHash,
    expiresAt,
    resendAvailableAt,
  };
  await account.save();

  try {
    await sendVerificationCodeEmail({ to: account.email, name: account.name, code: verificationCode });
  } catch (e) {
    return res.status(500).json({ message: 'Gửi mã xác thực thất bại. Vui lòng thử lại sau.' });
  }

  return res.status(200).json({ message: 'Mã xác thực đã được gửi lại về email.' });
}

async function forgotPassword(req, res) {
  const { email } = req.body || {};

  if (!isNonEmptyString(email)) {
    return res.status(200).json({ message: 'Nếu email tồn tại, mật khẩu mới đã được gửi.' });
  }

  if (!isValidEmail(email)) {
    return res.status(200).json({ message: 'Nếu email tồn tại, mật khẩu mới đã được gửi.' });
  }

  const normalizedEmail = normalizeEmail(email);
  const account = await UserAccount.findOne({ email: normalizedEmail }).populate('roleID');


  if (account && account.status === 'Active') {
    const roleName = account.roleID?.name;
    if (roleName && ALLOWED_LOGIN_ROLES.map(roleKey).includes(roleKey(roleName))) {
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

  return res.status(200).json({ message: 'Nếu email tồn tại, mật khẩu mới đã được gửi.' });
}

module.exports = {
  login,
  registerCustomer,
  verifyEmail,
  resendVerification,
  forgotPassword,
};
