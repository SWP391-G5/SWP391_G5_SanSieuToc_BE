const mongoose = require('mongoose');

const AdminAccount = require('../../models/AdminAccount');
const UserAccount = require('../../models/UserAccount');
const Wallet = require('../../models/Wallet');
const Transaction = require('../../models/Transaction');
const Role = require('../../models/Role');
const { hashPassword, generateRandomPassword } = require('../../utils/password');
const {
  isEmailConfigured,
  sendAccountCredentialsEmail,
  sendManagerDeletionNoticeEmail,
  sendOwnerDeletionScheduledEmail,
} = require('../../utils/mailer');
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
  const managerDoc = accountDoc.managerID && accountDoc.managerID.username ? accountDoc.managerID : null;
  const deletion = accountDoc.deletion?.scheduledAt
    ? {
        requestedAt: accountDoc.deletion?.requestedAt,
        scheduledAt: accountDoc.deletion?.scheduledAt,
      }
    : null;
  return {
    id: accountDoc._id,
    username: accountDoc.username,
    email: accountDoc.email,
    name: accountDoc.name,
    phone: accountDoc.phone || '',
    address: accountDoc.address || '',
    image: accountDoc.image || '',
    role: accountDoc.roleID?.name,
    manager: managerDoc
      ? {
          id: managerDoc._id,
          username: managerDoc.username,
          email: managerDoc.email,
          name: managerDoc.name,
        }
      : accountDoc.managerID
        ? { id: accountDoc.managerID }
        : null,
    status: accountDoc.status,
    deletion,
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

  const [existingAdmin, existingUserByEmail] = await Promise.all([
    AdminAccount.findOne({ $or: [{ email }, { username }] }),
    UserAccount.findOne({ email }),
  ]);

  if (existingAdmin || existingUserByEmail) {
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

async function resolveReceiverAdminId(actorAdminId) {
  const adminRoleId = await getRoleIdByName('Admin');

  if (mongoose.isValidObjectId(actorAdminId)) {
    const actor = await AdminAccount.findOne({ _id: actorAdminId, roleID: adminRoleId, status: 'Active' });
    if (actor) return actor._id;
  }

  const fallback = await AdminAccount.findOne({ roleID: adminRoleId, status: 'Active' }).sort({ createdAt: 1 });
  return fallback?._id || null;
}

async function resolveReassignManagerId(fromManagerId, preferredManagerId) {
  const managerRoleId = await getRoleIdByName('Manager');

  if (preferredManagerId) {
    if (!mongoose.isValidObjectId(preferredManagerId)) return null;
    if (String(preferredManagerId) === String(fromManagerId)) return null;

    const target = await AdminAccount.findOne({
      _id: preferredManagerId,
      roleID: managerRoleId,
      status: 'Active',
    });
    return target?._id || null;
  }

  const anyOther = await AdminAccount.findOne({
    roleID: managerRoleId,
    status: 'Active',
    _id: { $ne: fromManagerId },
  }).sort({ createdAt: 1 });

  return anyOther?._id || null;
}

async function transferAdminWalletBalance({ fromAdminAccountId, toAdminAccountId, reason }) {
  if (!mongoose.isValidObjectId(fromAdminAccountId) || !mongoose.isValidObjectId(toAdminAccountId)) {
    return { ok: false, message: 'Wallet transfer failed: invalid account id.' };
  }

  const fromWallet = await Wallet.findOne({ walletOwnerModel: 'AdminAccount', walletOwnerId: fromAdminAccountId });
  if (!fromWallet || !fromWallet.balance || fromWallet.balance <= 0) return { ok: true, moved: 0 };

  let toWallet = await Wallet.findOne({ walletOwnerModel: 'AdminAccount', walletOwnerId: toAdminAccountId });
  if (!toWallet) {
    toWallet = await Wallet.create({ walletOwnerModel: 'AdminAccount', walletOwnerId: toAdminAccountId, balance: 0 });
  }

  const amount = Number(fromWallet.balance || 0);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: true, moved: 0 };

  const applyTransfer = async (session) => {
    const from = session
      ? await Wallet.findById(fromWallet._id).session(session)
      : await Wallet.findById(fromWallet._id);
    const to = session
      ? await Wallet.findById(toWallet._id).session(session)
      : await Wallet.findById(toWallet._id);

    if (!from || !to) throw new Error('Wallet not found');

    const moved = Number(from.balance || 0);
    if (!Number.isFinite(moved) || moved <= 0) return 0;

    const balanceBefore = Number(to.balance || 0);
    to.balance = balanceBefore + moved;
    from.balance = 0;

    await Promise.all([
      session ? from.save({ session }) : from.save(),
      session ? to.save({ session }) : to.save(),
      session
        ? Transaction.create(
            [
              {
                fromWalletID: from._id,
                toWalletID: to._id,
                type: 'Commission Transaction',
                amount: moved,
                balanceBefore,
                balanceAfter: to.balance,
                description: reason || 'Transfer balance due to manager deletion',
              },
            ],
            { session }
          )
        : Transaction.create([
            {
              fromWalletID: from._id,
              toWalletID: to._id,
              type: 'Commission Transaction',
              amount: moved,
              balanceBefore,
              balanceAfter: to.balance,
              description: reason || 'Transfer balance due to manager deletion',
            },
          ]),
    ]);

    return moved;
  };

  try {
    const session = await mongoose.startSession();
    let moved = 0;
    await session.withTransaction(async () => {
      moved = await applyTransfer(session);
    });
    await session.endSession();
    return { ok: true, moved };
  } catch (e) {
    try {
      const moved = await applyTransfer(null);
      return { ok: true, moved };
    } catch (e2) {
      return { ok: false, message: e2?.message || e?.message || 'Wallet transfer failed.' };
    }
  }
}

async function deleteManager(id, options = {}) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Manager');

  const account = await AdminAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Manager.' } };

  if (account.status === 'Deleted') {
    return { status: 200, body: { message: 'Tài khoản đã bị xóa.', item: normalizeAdminAccount(account) } };
  }

  // Reassign owners to another active manager before deleting.
  const ownerRoleId = await getRoleIdByName('Owner');
  const ownersCount = await UserAccount.countDocuments({ roleID: ownerRoleId, managerID: account._id });
  if (ownersCount > 0) {
    const targetManagerId = await resolveReassignManagerId(account._id, options?.reassignToManagerID);
    if (!targetManagerId) {
      return {
        status: 400,
        body: {
          message:
            'Không thể xóa Manager vì đang quản lý Owner. Vui lòng tạo/kích hoạt ít nhất 1 Manager khác để gán lại.',
        },
      };
    }
    await UserAccount.updateMany(
      { roleID: ownerRoleId, managerID: account._id },
      { $set: { managerID: targetManagerId } }
    );
  }

  // Transfer deleted manager wallet balance to Admin wallet.
  const receiverAdminId = await resolveReceiverAdminId(options?.actorAdminId);
  if (!receiverAdminId) {
    return { status: 500, body: { message: 'Không tìm thấy tài khoản Admin để nhận ví.' } };
  }

  const transfer = await transferAdminWalletBalance({
    fromAdminAccountId: account._id,
    toAdminAccountId: receiverAdminId,
    reason: `Transfer balance to admin due to manager deletion (${String(account.username || account.email || account._id)})`,
  });

  if (!transfer.ok) {
    return { status: 500, body: { message: `Chuyển ví thất bại: ${transfer.message}` } };
  }

  // Notify the manager about deletion + wallet transfer (best-effort).
  if (isEmailConfigured() && account.email) {
    try {
      const adminReceiver = await AdminAccount.findById(receiverAdminId).select('email name username');
      await sendManagerDeletionNoticeEmail({
        to: account.email,
        name: account.name,
        amount: transfer.moved || 0,
        adminEmail: adminReceiver?.email || undefined,
      });
    } catch {
      // best-effort: do not block deletion if email sending fails
    }
  }

  account.status = 'Deleted';
  await account.save();

  return { status: 200, body: { message: 'Đã xóa tài khoản (soft delete).', item: normalizeAdminAccount(account) } };
}

async function restoreManager(id) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Manager');

  const account = await AdminAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Manager.' } };

  if (account.status !== 'Deleted') {
    return { status: 200, body: { message: 'Tài khoản không ở trạng thái Deleted.', item: normalizeAdminAccount(account) } };
  }

  account.status = 'Active';
  await account.save();

  return { status: 200, body: { message: 'Đã khôi phục tài khoản Manager.', item: normalizeAdminAccount(account) } };
}

async function listOwners() {
  const roleId = await getRoleIdByName('Owner');
  const accounts = await UserAccount.find({ roleID: roleId })
    .populate('roleID')
    .populate({ path: 'managerID', select: 'username email name' })
    .sort({ createdAt: -1 });
  return { status: 200, body: { items: accounts.map(normalizeUserAccount) } };
}

async function createOwner(payload) {
  const valid = validateCreatePayload(payload);
  if (!valid.ok) return { status: 400, body: { message: valid.message } };

  const managerID = payload?.managerID || payload?.managerId;
  if (!mongoose.isValidObjectId(managerID)) {
    return { status: 400, body: { message: 'Vui lòng chọn Manager hợp lệ.' } };
  }

  if (!isEmailConfigured()) {
    return { status: 500, body: { message: 'Chức năng gửi email chưa được cấu hình.' } };
  }

  const { username, email, name, phone, address } = valid.value;

  const [existingUser, existingAdminByEmail] = await Promise.all([
    UserAccount.findOne({ $or: [{ email }, { username }] }),
    AdminAccount.findOne({ email }),
  ]);

  if (existingUser || existingAdminByEmail) {
    return { status: 409, body: { message: 'Email hoặc username đã tồn tại.' } };
  }

  const managerRoleId = await getRoleIdByName('Manager');
  const managerAccount = await AdminAccount.findOne({
    _id: managerID,
    roleID: managerRoleId,
    status: 'Active',
  });

  if (!managerAccount) {
    return { status: 400, body: { message: 'Manager không tồn tại hoặc chưa được kích hoạt.' } };
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
    managerID: managerAccount._id,
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

  const fresh = await UserAccount.findById(account._id)
    .populate('roleID')
    .populate({ path: 'managerID', select: 'username email name' });
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

async function requestDeleteOwner(id, options = {}) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Owner');

  const account = await UserAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Owner.' } };

  if (account.status === 'Deleted') {
    return { status: 200, body: { message: 'Tài khoản đã bị xóa.', item: normalizeUserAccount(account) } };
  }

  if (!isEmailConfigured()) {
    return { status: 500, body: { message: 'Chức năng gửi email chưa được cấu hình.' } };
  }

  // If already scheduled, do not spam email or re-schedule.
  if (account.deletion?.scheduledAt) {
    return {
      status: 200,
      body: { message: 'Tài khoản đã được lên lịch xóa.', item: normalizeUserAccount(account) },
    };
  }

  const now = Date.now();
  const scheduledAt = new Date(now + 3 * 24 * 60 * 60 * 1000);

  let adminEmail;
  if (mongoose.isValidObjectId(options?.actorAdminId)) {
    const adminRoleId = await getRoleIdByName('Admin');
    const admin = await AdminAccount.findOne({ _id: options.actorAdminId, roleID: adminRoleId }).select('email');
    adminEmail = admin?.email;
  }

  // Send email first; only schedule if email sending succeeds.
  try {
    await sendOwnerDeletionScheduledEmail({
      to: account.email,
      name: account.name,
      scheduledAt,
      adminEmail,
    });
  } catch {
    return { status: 500, body: { message: 'Gửi email thông báo xóa tài khoản thất bại. Vui lòng thử lại sau.' } };
  }

  account.deletion = {
    requestedAt: new Date(now),
    scheduledAt,
    requestedByAdminId: mongoose.isValidObjectId(options?.actorAdminId) ? options.actorAdminId : undefined,
  };
  await account.save();

  return {
    status: 200,
    body: { message: 'Đã gửi email. Tài khoản sẽ được xóa sau 3 ngày.', item: normalizeUserAccount(account) },
  };
}

async function restoreOwner(id) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Owner');

  const account = await UserAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Owner.' } };

  const hadSchedule = Boolean(account.deletion?.scheduledAt);
  const wasDeleted = account.status === 'Deleted';

  if (!hadSchedule && !wasDeleted) {
    return {
      status: 200,
      body: { message: 'Tài khoản không ở trạng thái cần khôi phục.', item: normalizeUserAccount(account) },
    };
  }

  account.deletion = undefined;
  if (wasDeleted) account.status = 'Active';
  await account.save();

  return {
    status: 200,
    body: {
      message: wasDeleted ? 'Đã khôi phục tài khoản Owner.' : 'Đã hủy lịch xóa tài khoản Owner.',
      item: normalizeUserAccount(account),
    },
  };
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

async function unbanCustomer(id) {
  if (!mongoose.isValidObjectId(id)) return { status: 400, body: { message: 'ID không hợp lệ.' } };
  const roleId = await getRoleIdByName('Customer');

  const account = await UserAccount.findOne({ _id: id, roleID: roleId }).populate('roleID');
  if (!account) return { status: 404, body: { message: 'Không tìm thấy tài khoản Customer.' } };

  if (account.status !== 'Banned') {
    return { status: 200, body: { message: 'Tài khoản không ở trạng thái Banned.', item: normalizeUserAccount(account) } };
  }

  account.status = 'Active';
  await account.save();

  return { status: 200, body: { message: 'Đã mở khóa tài khoản Customer.', item: normalizeUserAccount(account) } };
}

module.exports = {
  listManagers,
  createManager,
  deactivateManager,
  deleteManager,
  restoreManager,
  listOwners,
  createOwner,
  deactivateOwner,
  requestDeleteOwner,
  restoreOwner,
  listCustomers,
  banCustomer,
  unbanCustomer,
};
