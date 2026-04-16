const AdminAccount = require('../../models/AdminAccount');
const { verifyPassword, hashPassword } = require('../../utils/password');
const {
  isNonEmptyString,
  isValidAddress,
  isValidImageUrl,
  isValidName,
  isValidPassword,
  isValidPhone,
  normalizePhone,
} = require('../../utils/validators');

function normalizeAdminProfile(accountDoc) {
  return {
    id: accountDoc._id,
    username: accountDoc.username,
    email: accountDoc.email,
    name: accountDoc.name,
    phone: accountDoc.phone || '',
    address: accountDoc.address || '',
    image: accountDoc.image || '',
    role: accountDoc.roleID?.name,
    accountType: 'admin',
  };
}

async function getProfile(adminId) {
  if (!adminId) return { status: 401, body: { message: 'Unauthorized' } };

  const account = await AdminAccount.findById(adminId).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản.' } };

  if (account.status !== 'Active') {
    return { status: 403, body: { message: 'Tài khoản đã bị vô hiệu hóa.' } };
  }

  return { status: 200, body: { user: normalizeAdminProfile(account) } };
}

async function updateProfile(adminId, payload) {
  if (!adminId) return { status: 401, body: { message: 'Unauthorized' } };

  const account = await AdminAccount.findById(adminId).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản.' } };

  if (account.status !== 'Active') {
    return { status: 403, body: { message: 'Tài khoản đã bị vô hiệu hóa.' } };
  }

  const { username, email, name, phone, address, image } = payload || {};

  if (typeof username !== 'undefined' && isNonEmptyString(username) && String(username).trim() !== String(account.username)) {
    return { status: 400, body: { message: 'Không được thay đổi username.' } };
  }

  if (typeof email !== 'undefined' && isNonEmptyString(email) && String(email).trim().toLowerCase() !== String(account.email)) {
    return { status: 400, body: { message: 'Chưa hỗ trợ thay đổi email.' } };
  }

  if (typeof name !== 'undefined') {
    if (typeof name !== 'string' || !isValidName(name)) {
      return { status: 400, body: { message: 'Họ tên không hợp lệ.' } };
    }
    account.name = name.trim();
  }

  if (typeof phone !== 'undefined') {
    if (typeof phone !== 'string' || !isValidPhone(phone)) {
      return {
        status: 400,
        body: { message: 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0; ví dụ 09xxxxxxxx).' },
      };
    }
    account.phone = normalizePhone(phone);
  }

  if (typeof address !== 'undefined') {
    if (typeof address !== 'string' || !isValidAddress(address)) {
      return { status: 400, body: { message: 'Địa chỉ không hợp lệ.' } };
    }
    account.address = address.trim();
  }

  if (typeof image !== 'undefined') {
    if (typeof image !== 'string' || !isValidImageUrl(image)) {
      return { status: 400, body: { message: 'Ảnh không hợp lệ.' } };
    }
    account.image = image.trim();
  }

  await account.save();

  return { status: 200, body: { user: normalizeAdminProfile(account) } };
}

async function changePassword(adminId, payload) {
  if (!adminId) return { status: 401, body: { message: 'Unauthorized' } };

  const { currentPassword, newPassword } = payload || {};

  if (!isNonEmptyString(currentPassword) || !isNonEmptyString(newPassword)) {
    return { status: 400, body: { message: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.' } };
  }

  if (!isValidPassword(newPassword)) {
    return { status: 400, body: { message: 'Mật khẩu mới phải từ 6 đến 128 ký tự.' } };
  }

  const account = await AdminAccount.findById(adminId);
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản.' } };

  if (account.status !== 'Active') {
    return { status: 403, body: { message: 'Tài khoản đã bị vô hiệu hóa.' } };
  }

  const ok = await verifyPassword(String(currentPassword), account.password);
  if (!ok) return { status: 401, body: { message: 'Mật khẩu hiện tại không đúng.' } };

  const sameAsOld = await verifyPassword(String(newPassword), account.password);
  if (sameAsOld) return { status: 400, body: { message: 'Mật khẩu mới không được trùng mật khẩu cũ.' } };

  account.password = await hashPassword(String(newPassword));
  await account.save();

  return { status: 200, body: { message: 'Đổi mật khẩu thành công.' } };
}

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
};
