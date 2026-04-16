const UserAccount = require('../../models/UserAccount');
const Wallet = require('../../models/Wallet');
const { verifyPassword, hashPassword } = require('../../utils/password');
const { generateNumericCode, hashOtpCode, verifyOtpCode } = require('../../utils/otp');
const { isEmailConfigured, sendVerificationCodeEmail } = require('../../utils/mailer');
const { isNonEmptyString, isValidPassword, isValidEmail, normalizeEmail } = require('../../utils/validators');

function normalizeUserProfile(accountDoc) {
  return {
    id: accountDoc._id,
    username: accountDoc.username,
    email: accountDoc.email,
    name: accountDoc.name,
    phone: accountDoc.phone || '',
    address: accountDoc.address || '',
    image: accountDoc.image || '',
    role: accountDoc.roleID?.name,
    accountType: 'user',
  };
}

async function getProfile(req, res) {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const account = await UserAccount.findById(userId).populate('roleID');
  if (!account) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });

  // Ensure wallet exists
  let wallet = await Wallet.findOne({
    walletOwnerId: account._id,
    $or: [{ walletOwnerModel: 'UserAccount' }, { walletOwnerModel: { $exists: false } }],
  });

  if (!wallet) {
    wallet = await Wallet.create({ walletOwnerModel: 'UserAccount', walletOwnerId: account._id, balance: 0 });
  } else if (!wallet.walletOwnerModel) {
    wallet.walletOwnerModel = 'UserAccount';
    await wallet.save();
  }

  return res.status(200).json({
    user: normalizeUserProfile(account),
    wallet: { id: wallet._id, balance: wallet.balance },
  });
}

async function updateProfile(req, res) {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const account = await UserAccount.findById(userId).populate('roleID');
  if (!account) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });

  const { username, email, name, phone, address, image } = req.body || {};

  if (typeof username !== 'undefined' && isNonEmptyString(username) && String(username).trim() !== String(account.username)) {
    return res.status(400).json({ message: 'Không được thay đổi username.' });
  }

  if (typeof email !== 'undefined' && isNonEmptyString(email) && String(email).trim().toLowerCase() !== String(account.email)) {
    return res.status(400).json({ message: 'Chưa hỗ trợ thay đổi email.' });
  }

  if (typeof name !== 'undefined') {
    if (!isNonEmptyString(name)) return res.status(400).json({ message: 'Họ tên không hợp lệ.' });
    account.name = String(name).trim().slice(0, 120);
  }

  if (typeof phone !== 'undefined') {
    account.phone = String(phone || '').trim().slice(0, 30);
  }

  if (typeof address !== 'undefined') {
    account.address = String(address || '').trim().slice(0, 200);
  }

  if (typeof image !== 'undefined') {
    account.image = String(image || '').trim().slice(0, 2000);
  }

  await account.save();

  return res.status(200).json({ user: normalizeUserProfile(account) });
}

async function changePassword(req, res) {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { currentPassword, newPassword } = req.body || {};

  if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword)) {
    return res.status(400).json({ message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' });
  }

  if (!isValidPassword(newPassword)) {
    return res.status(400).json({ message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
  }

  const account = await UserAccount.findById(userId);
  if (!account) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });

  const ok = await verifyPassword(String(currentPassword), account.password);
  if (!ok) return res.status(401).json({ message: 'Mật khẩu hiện tại không đúng.' });

  const sameAsOld = await verifyPassword(String(newPassword), account.password);
  if (sameAsOld) return res.status(400).json({ message: 'Mật khẩu mới không được trùng mật khẩu cũ.' });

  account.password = await hashPassword(String(newPassword));
  await account.save();

  return res.status(200).json({ message: 'Đổi mật khẩu thành công.' });
}

async function requestEmailChange(req, res) {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { newEmail } = req.body || {};

  if (!isNonEmptyString(newEmail) || !isValidEmail(newEmail)) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }

  if (!isEmailConfigured()) {
    return res.status(500).json({ message: 'Chức năng gửi email chưa được cấu hình.' });
  }

  const account = await UserAccount.findById(userId);
  if (!account) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });

  const normalizedNewEmail = normalizeEmail(newEmail);
  const currentEmail = normalizeEmail(account.email);

  if (normalizedNewEmail === currentEmail) {
    return res.status(400).json({ message: 'Email mới phải khác email hiện tại.' });
  }

  const existing = await UserAccount.findOne({ email: normalizedNewEmail, _id: { $ne: account._id } });
  if (existing) {
    return res.status(409).json({ message: 'Email đã tồn tại.' });
  }

  const now = Date.now();
  const resendAt = account.emailChange?.resendAvailableAt;
  const pendingNewEmail = account.emailChange?.newEmail;

  if (pendingNewEmail === normalizedNewEmail && resendAt && resendAt.getTime() > now) {
    const seconds = Math.ceil((resendAt.getTime() - now) / 1000);
    return res.status(429).json({ message: `Vui lòng chờ ${seconds} giây để gửi lại mã.` });
  }

  const code = generateNumericCode(6);
  const codeHash = hashOtpCode(code);
  const expiresAt = new Date(now + 5 * 60 * 1000);
  const resendAvailableAt = new Date(now + 60 * 1000);

  account.emailChange = {
    newEmail: normalizedNewEmail,
    codeHash,
    expiresAt,
    resendAvailableAt,
  };
  await account.save();

  try {
    await sendVerificationCodeEmail({ to: normalizedNewEmail, name: account.name, code });
  } catch (e) {
    // rollback emailChange to avoid locking user in a pending state
    account.emailChange = { newEmail: '', codeHash: '', expiresAt: undefined, resendAvailableAt: undefined };
    await account.save();
    return res.status(500).json({ message: 'Gửi mã xác thực thất bại. Vui lòng thử lại sau.' });
  }

  return res.status(200).json({
    message: 'Mã xác thực đã được gửi về email mới.',
    email: normalizedNewEmail,
    expiresAt,
  });
}

async function verifyEmailChange(req, res) {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const { newEmail, code } = req.body || {};

  if (!isNonEmptyString(newEmail) || !isValidEmail(newEmail) || !isNonEmptyString(code)) {
    return res.status(400).json({ message: 'Vui lòng nhập email mới và mã xác thực.' });
  }

  const account = await UserAccount.findById(userId).populate('roleID');
  if (!account) return res.status(404).json({ message: 'Không tìm thấy tài khoản.' });

  const normalizedNewEmail = normalizeEmail(newEmail);
  const pending = account.emailChange || {};

  if (!pending.newEmail || pending.newEmail !== normalizedNewEmail) {
    return res.status(400).json({ message: 'Yêu cầu đổi email không hợp lệ hoặc đã hết hạn.' });
  }

  if (!pending.expiresAt || pending.expiresAt.getTime() < Date.now()) {
    return res.status(400).json({ message: 'Mã xác thực không đúng hoặc đã hết hạn.' });
  }

  const ok = verifyOtpCode({ code: String(code).trim(), codeHash: pending.codeHash });
  if (!ok) {
    return res.status(400).json({ message: 'Mã xác thực không đúng hoặc đã hết hạn.' });
  }

  const exists = await UserAccount.findOne({ email: normalizedNewEmail, _id: { $ne: account._id } });
  if (exists) {
    return res.status(409).json({ message: 'Email đã tồn tại.' });
  }

  account.email = normalizedNewEmail;
  account.emailVerified = true;
  account.emailChange = { newEmail: '', codeHash: '', expiresAt: undefined, resendAvailableAt: undefined };
  await account.save();

  return res.status(200).json({
    message: 'Đổi email thành công.',
    user: normalizeUserProfile(account),
  });
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  requestEmailChange,
  verifyEmailChange,
};
