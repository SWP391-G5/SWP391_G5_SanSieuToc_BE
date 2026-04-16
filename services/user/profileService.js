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

async function getProfile(userId) {
  if (!userId) return { status: 401, body: { message: 'Unauthorized' } };

  const account = await UserAccount.findById(userId).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản.' } };

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

  return {
    status: 200,
    body: {
      user: normalizeUserProfile(account),
      wallet: { id: wallet._id, balance: wallet.balance },
    },
  };
}

async function updateProfile(userId, payload) {
  if (!userId) return { status: 401, body: { message: 'Unauthorized' } };

  const account = await UserAccount.findById(userId).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản.' } };

  const { username, email, name, phone, address, image } = payload || {};

  if (typeof username !== 'undefined' && isNonEmptyString(username) && String(username).trim() !== String(account.username)) {
    return { status: 400, body: { message: 'Không được thay đổi username.' } };
  }

  if (typeof email !== 'undefined' && isNonEmptyString(email) && String(email).trim().toLowerCase() !== String(account.email)) {
    return { status: 400, body: { message: 'Chưa hỗ trợ thay đổi email.' } };
  }

  if (typeof name !== 'undefined') {
    if (!isNonEmptyString(name)) return { status: 400, body: { message: 'Họ tên không hợp lệ.' } };
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

  return { status: 200, body: { user: normalizeUserProfile(account) } };
}

async function changePassword(userId, payload) {
  if (!userId) return { status: 401, body: { message: 'Unauthorized' } };

  const { currentPassword, newPassword } = payload || {};

  if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword)) {
    return { status: 400, body: { message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' } };
  }

  if (!isValidPassword(newPassword)) {
    return { status: 400, body: { message: 'Mật khẩu mới phải có ít nhất 6 ký tự.' } };
  }

  const account = await UserAccount.findById(userId);
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản.' } };

  const ok = await verifyPassword(String(currentPassword), account.password);
  if (!ok) return { status: 401, body: { message: 'Mật khẩu hiện tại không đúng.' } };

  const sameAsOld = await verifyPassword(String(newPassword), account.password);
  if (sameAsOld) return { status: 400, body: { message: 'Mật khẩu mới không được trùng mật khẩu cũ.' } };

  account.password = await hashPassword(String(newPassword));
  await account.save();

  return { status: 200, body: { message: 'Đổi mật khẩu thành công.' } };
}

async function requestEmailChange(userId, payload) {
  if (!userId) return { status: 401, body: { message: 'Unauthorized' } };

  const { newEmail } = payload || {};

  if (!isNonEmptyString(newEmail) || !isValidEmail(newEmail)) {
    return { status: 400, body: { message: 'Email không hợp lệ.' } };
  }

  if (!isEmailConfigured()) {
    return { status: 500, body: { message: 'Chức năng gửi email chưa được cấu hình.' } };
  }

  const account = await UserAccount.findById(userId);
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản.' } };

  const normalizedNewEmail = normalizeEmail(newEmail);
  const currentEmail = normalizeEmail(account.email);

  if (normalizedNewEmail === currentEmail) {
    return { status: 400, body: { message: 'Email mới phải khác email hiện tại.' } };
  }

  const existing = await UserAccount.findOne({ email: normalizedNewEmail, _id: { $ne: account._id } });
  if (existing) {
    return { status: 409, body: { message: 'Email đã tồn tại.' } };
  }

  const now = Date.now();
  const resendAt = account.emailChange?.resendAvailableAt;
  const pendingNewEmail = account.emailChange?.newEmail;

  if (pendingNewEmail === normalizedNewEmail && resendAt && resendAt.getTime() > now) {
    const seconds = Math.ceil((resendAt.getTime() - now) / 1000);
    return { status: 429, body: { message: `Vui lòng chờ ${seconds} giây để gửi lại mã.` } };
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
    account.emailChange = { newEmail: '', codeHash: '', expiresAt: undefined, resendAvailableAt: undefined };
    await account.save();
    return { status: 500, body: { message: 'Gửi mã xác thực thất bại. Vui lòng thử lại sau.' } };
  }

  return {
    status: 200,
    body: { message: 'Mã xác thực đã được gửi về email mới.', email: normalizedNewEmail, expiresAt },
  };
}

async function verifyEmailChange(userId, payload) {
  if (!userId) return { status: 401, body: { message: 'Unauthorized' } };

  const { newEmail, code } = payload || {};

  if (!isNonEmptyString(newEmail) || !isValidEmail(newEmail) || !isNonEmptyString(code)) {
    return { status: 400, body: { message: 'Vui lòng nhập email mới và mã xác thực.' } };
  }

  const account = await UserAccount.findById(userId).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản.' } };

  const normalizedNewEmail = normalizeEmail(newEmail);
  const pending = account.emailChange || {};

  if (!pending.newEmail || pending.newEmail !== normalizedNewEmail) {
    return { status: 400, body: { message: 'Yêu cầu đổi email không hợp lệ hoặc đã hết hạn.' } };
  }

  if (!pending.expiresAt || pending.expiresAt.getTime() < Date.now()) {
    return { status: 400, body: { message: 'Mã xác thực không đúng hoặc đã hết hạn.' } };
  }

  const ok = verifyOtpCode({ code: String(code).trim(), codeHash: pending.codeHash });
  if (!ok) {
    return { status: 400, body: { message: 'Mã xác thực không đúng hoặc đã hết hạn.' } };
  }

  const exists = await UserAccount.findOne({ email: normalizedNewEmail, _id: { $ne: account._id } });
  if (exists) {
    return { status: 409, body: { message: 'Email đã tồn tại.' } };
  }

  account.email = normalizedNewEmail;
  account.emailVerified = true;
  account.emailChange = { newEmail: '', codeHash: '', expiresAt: undefined, resendAvailableAt: undefined };
  await account.save();

  return {
    status: 200,
    body: { message: 'Đổi email thành công.', user: normalizeUserProfile(account) },
  };
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  requestEmailChange,
  verifyEmailChange,
};


