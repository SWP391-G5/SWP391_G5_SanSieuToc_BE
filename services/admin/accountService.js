const mongoose = require('mongoose');

const AdminAccount = require('../../models/AdminAccount');
const UserAccount = require('../../models/UserAccount');
const Role = require('../../models/Role');
const { hashPassword, generateRandomPassword } = require('../../utils/password');
const { isEmailConfigured, sendAccountCredentialsEmail } = require('../../utils/mailer');
const {
  isNonEmptyString,
  isValidEmail,
  isValidName,
  isValidPhone,
  isValidAddress,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
  normalizePhone,
} = require('../../utils/validators');

function normalizeAdminAccount(accountDoc) {
  return {
    id: accountDoc._id,
    username: accountDoc.username,
    email: accountDoc.email,
    name: accountDoc.name,
    phone: accountDoc.phone || '',
    address: accountDoc.address || '',
    image: accountDoc.image || '',
    role: accountDoc.roleID?.name,
    status: accountDoc.status,
    createdAt: accountDoc.createdAt,
    updatedAt: accountDoc.updatedAt,
  };
}

function normalizeUserAccount(accountDoc) {
  return {
    id: accountDoc._id,
    username: accountDoc.username,
    email: accountDoc.email,
    name: accountDoc.name,
    phone: accountDoc.phone || '',
    address: accountDoc.address || '',
    image: accountDoc.image || '',
    role: accountDoc.roleID?.name,
    status: accountDoc.status,
    createdAt: accountDoc.createdAt,
    updatedAt: accountDoc.updatedAt,
  };
}

async function getRoleIdByName(name) {
  let roleDoc = await Role.findOne({ name: new RegExp(`^${name}$`, 'i') });
  if (!roleDoc) {
    roleDoc = await Role.create({ name });
  }
  return roleDoc._id;
}

function validateCreatePayload(payload) {
  const { username, email, name, phone, address } = payload || {};

  if (!isNonEmptyString(username) || !isNonEmptyString(email) || !isNonEmptyString(name)) {
    return { ok: false, message: 'Vui lòng nhập username, email và họ tên.' };
  }

  const normalizedUsername = normalizeUsername(username);
  if (!isValidUsername(normalizedUsername)) {
    return { ok: false, message: 'Username không hợp lệ.' };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { ok: false, message: 'Email không hợp lệ.' };
  }

  const trimmedName = String(name).trim();
  if (!isValidName(trimmedName)) {
    return { ok: false, message: 'Họ tên không hợp lệ.' };
  }

  const normalizedPhone = typeof phone === 'string' ? normalizePhone(phone) : '';
  if (!isValidPhone(normalizedPhone)) {
    return { ok: false, message: 'Số điện thoại không hợp lệ.' };
  }

  const safeAddress = typeof address === 'string' ? address.trim() : '';
  if (!isValidAddress(safeAddress)) {
    return { ok: false, message: 'Địa chỉ không hợp lệ.' };
  }

  return {
    ok: true,
    value: {
      username: normalizedUsername,
      email: normalizedEmail,
      name: trimmedName,
      phone: normalizedPhone,
      address: safeAddress,
    },
  };
}

async function listManagers() {
  const roleId = await getRoleIdByName('Manager');
  const accounts = await AdminAccount.find({ roleID: roleId }).populate('roleID').sort({ createdAt: -1 });
  return { status: 200, body: { items: accounts.map(normalizeAdminAccount) } };
}

async function createManager(payload) {
  const valid = validateCreatePayload(payload);
  if (!valid.ok) return { status: 400, body: { message: valid.message } };

  if (!isEmailConfigured()) {
    return { status: 500, body: { message: 'Chức năng gửi email chưa được cấu hình.' } };
  }

  const { username, email, name, phone, address } = valid.value;

  const existing = await AdminAccount.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    return { status: 409, body: { message: 'Email hoặc username đã tồn tại.' } };
  }

  const roleId = await getRoleIdByName('Manager');
  const passwordPlain = generateRandomPassword(12);
  const passwordHash = await hashPassword(passwordPlain);

  const account = await AdminAccount.create({
    username,
    email,
    name,
    phone,
    address,
    password: passwordHash,
    roleID: roleId,
    status: 'InActive',
    emailVerified: false,
  });

  try {
    await sendAccountCredentialsEmail({ to: email, name, username, password: passwordPlain, role: 'Manager' });
  } catch (e) {
    try {
      await AdminAccount.deleteOne({ _id: account._id });
    } catch {
      // ignore
    }
    return { status: 500, body: { message: 'Gửi email tài khoản thất bại. Vui lòng thử lại sau.' } };
  }

  const fresh = await AdminAccount.findById(account._id).populate('roleID');
  return { status: 201, body: { message: 'Tạo tài khoản Manager thành công.', item: normalizeAdminAccount(fresh) } };
}

async function deactivateManager(id) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Manager');

  const account = await AdminAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Manager.' } };

  account.status = 'InActive';
  await account.save();

  return { status: 200, body: { message: 'Đã vô hiệu hóa tài khoản.', item: normalizeAdminAccount(account) } };
}

async function deleteManager(id) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Manager');

  const account = await AdminAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Manager.' } };

  if (account.status === 'Deleted') {
    return { status: 200, body: { message: 'Tài khoản đã bị xóa.', item: normalizeAdminAccount(account) } };
  }

  account.status = 'Deleted';
  await account.save();

  return { status: 200, body: { message: 'Đã xóa tài khoản (soft delete).', item: normalizeAdminAccount(account) } };
}

async function listOwners() {
  const roleId = await getRoleIdByName('Owner');
  const accounts = await UserAccount.find({ roleID: roleId }).populate('roleID').sort({ createdAt: -1 });
  return { status: 200, body: { items: accounts.map(normalizeUserAccount) } };
}

async function createOwner(payload) {
  const valid = validateCreatePayload(payload);
  if (!valid.ok) return { status: 400, body: { message: valid.message } };

  if (!isEmailConfigured()) {
    return { status: 500, body: { message: 'Chức năng gửi email chưa được cấu hình.' } };
  }

  const { username, email, name, phone, address } = valid.value;

  const existing = await UserAccount.findOne({ $or: [{ email }, { username }] });
  if (existing) {
    return { status: 409, body: { message: 'Email hoặc username đã tồn tại.' } };
  }

  const roleId = await getRoleIdByName('Owner');
  const passwordPlain = generateRandomPassword(12);
  const passwordHash = await hashPassword(passwordPlain);

  const account = await UserAccount.create({
    username,
    email,
    name,
    phone,
    address,
    password: passwordHash,
    roleID: roleId,
    status: 'InActive',
    emailVerified: false,
  });

  try {
    await sendAccountCredentialsEmail({ to: email, name, username, password: passwordPlain, role: 'Owner' });
  } catch (e) {
    try {
      await UserAccount.deleteOne({ _id: account._id });
    } catch {
      // ignore
    }
    return { status: 500, body: { message: 'Gửi email tài khoản thất bại. Vui lòng thử lại sau.' } };
  }

  const fresh = await UserAccount.findById(account._id).populate('roleID');
  return { status: 201, body: { message: 'Tạo tài khoản Owner thành công.', item: normalizeUserAccount(fresh) } };
}

async function deactivateOwner(id) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Owner');

  const account = await UserAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Owner.' } };

  account.status = 'InActive';
  await account.save();

  return { status: 200, body: { message: 'Đã vô hiệu hóa tài khoản.', item: normalizeUserAccount(account) } };
}

async function listCustomers() {
  const roleId = await getRoleIdByName('Customer');
  const accounts = await UserAccount.find({ roleID: roleId }).populate('roleID').sort({ createdAt: -1 });
  return { status: 200, body: { items: accounts.map(normalizeUserAccount) } };
}

async function banCustomer(id) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Customer');

  const account = await UserAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Customer.' } };

  account.status = 'Banned';
  await account.save();

  return { status: 200, body: { message: 'Đã khóa tài khoản Customer.', item: normalizeUserAccount(account) } };
}

module.exports = {
  listManagers,
  createManager,
  deactivateManager,
  deleteManager,
  listOwners,
  createOwner,
  deactivateOwner,
  listCustomers,
  banCustomer,
};
