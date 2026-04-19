/*
 * db/seed/seed-atlas.js
 * Seed sample data into MongoDB Atlas for Manager statistics testing.
 *
 * Usage:
 * 1) Copy db/seed/seed.config.example.json -> db/seed/seed.config.json and fill values.
 * 2) node db/seed/seed-atlas.js
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const models = require('../../models');

const CONFIG_PATH = path.join(__dirname, 'seed.config.json');
const DATA_PATH = path.join(__dirname, 'seed-data.json');

function mustReadJson(p) {
  if (!fs.existsSync(p)) {
    throw new Error(`Missing file: ${p}. Create it from seed.config.example.json / seed-data.json`);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function toObjectId(id) {
  return new mongoose.Types.ObjectId(String(id));
}

function isoOrNow(s) {
  return s ? new Date(s) : new Date();
}

async function upsertRoleByName(name) {
  // IMPORTANT: Role schema uses field `name`, not `roleName`
  const existing = await models.Role.findOne({ name }).lean();
  if (existing?._id) return existing._id;
  const created = await models.Role.create({ name });
  return created._id;
}

async function ensureWallet(ownerModel, ownerId) {
  const found = await models.Wallet.findOne({ walletOwnerModel: ownerModel, walletOwnerId: ownerId }).lean();
  if (found?._id) return found._id;
  const w = await models.Wallet.create({ walletOwnerModel: ownerModel, walletOwnerId: ownerId, balance: 0 });
  return w._id;
}

async function main() {
  const cfg = mustReadJson(CONFIG_PATH);
  const data = mustReadJson(DATA_PATH);

  const mongoUri = String(cfg.mongoUri || '').trim();
  if (!mongoUri) throw new Error('seed.config.json: mongoUri is required');

  const managerAdminId = String(cfg.managerAdminId || '').trim();
  if (!managerAdminId || !mongoose.isValidObjectId(managerAdminId)) {
    throw new Error('seed.config.json: managerAdminId is required and must be ObjectId');
  }

  console.log('[seed] connecting...');
  await mongoose.connect(mongoUri);
  console.log('[seed] connected');

  // Ensure roles exist
  const ownerRoleId = cfg.roleIds?.owner && mongoose.isValidObjectId(String(cfg.roleIds.owner))
    ? toObjectId(cfg.roleIds.owner)
    : await upsertRoleByName('Owner');

  const customerRoleId = cfg.roleIds?.customer && mongoose.isValidObjectId(String(cfg.roleIds.customer))
    ? toObjectId(cfg.roleIds.customer)
    : await upsertRoleByName('Customer');

  // ---------- Owners ----------
  console.log('[seed] upserting owners...');
  for (const o of data.owners || []) {
    const _id = toObjectId(o._id);
    await models.UserAccount.updateOne(
      { _id },
      {
        $set: {
          username: o.username,
          email: String(o.email || '').toLowerCase(),
          name: o.name,
          phone: o.phone || '',
          address: o.address || '',
          image: o.image || '',
          password: o.password || '$2b$10$PX66GQCC6jjgFpC4lw5EueNe.0pLsODdXMpIjgSoPq1r/aS5ZYM.6',
          roleID: ownerRoleId,
          managerID: toObjectId(managerAdminId),
          status: o.status || 'Active',
          emailVerified: o.emailVerified !== false,
        },
      },
      { upsert: true }
    );
  }

  // ---------- Customers ----------
  console.log('[seed] upserting customers...');
  for (const c of data.customers || []) {
    const _id = toObjectId(c._id);
    await models.UserAccount.updateOne(
      { _id },
      {
        $set: {
          username: c.username,
          email: String(c.email || '').toLowerCase(),
          name: c.name,
          phone: c.phone || '',
          address: c.address || '',
          image: c.image || '',
          password: c.password || '$2b$10$PX66GQCC6jjgFpC4lw5EueNe.0pLsODdXMpIjgSoPq1r/aS5ZYM.6',
          roleID: customerRoleId,
          managerID: null,
          status: c.status || 'Active',
          emailVerified: c.emailVerified !== false,
        },
      },
      { upsert: true }
    );
  }

  // Ensure wallets for all users (optional but helps if later code expects)
  console.log('[seed] ensuring wallets for owners/customers...');
  for (const o of data.owners || []) await ensureWallet('UserAccount', toObjectId(o._id));
  for (const c of data.customers || []) await ensureWallet('UserAccount', toObjectId(c._id));
  await ensureWallet('AdminAccount', toObjectId(managerAdminId));

  // ---------- Fields ----------
  console.log('[seed] upserting fields...');
  for (const f of data.fields || []) {
    const _id = toObjectId(f._id);
    await models.Field.updateOne(
      { _id },
      {
        $set: {
          ownerID: toObjectId(f.ownerId),
          fieldType: f.fieldType,
          fieldName: f.fieldName,
          price: Number(f.price || 0),
          address: f.address || '',
          description: f.description || '',
          city: f.city || '',
          sizeKey: f.sizeKey || '',
          hourlyPrice: Number(f.hourlyPrice || 0),
          slotDuration: Number(f.slotDuration || 60),
          openingTime: f.openingTime || '06:00',
          closingTime: f.closingTime || '22:00',
          utilities: Array.isArray(f.utilities) ? f.utilities : [],
          status: f.status || 'Active',
          image: Array.isArray(f.image) ? f.image : [],
        },
      },
      { upsert: true }
    );
  }

  // ---------- Bookings ----------
  console.log('[seed] upserting bookings...');
  for (const b of data.bookings || []) {
    const _id = toObjectId(b._id);
    await models.Booking.updateOne(
      { _id },
      {
        $set: {
          customerID: toObjectId(b.customerId),
          totalPrice: Number(b.totalPrice || 0),
          statusPayment: b.statusPayment || 'Pending',
          status: b.status || 'Booked',
          refundReason: b.refundReason || '',
          createdAt: isoOrNow(b.createdAt),
          updatedAt: isoOrNow(b.updatedAt || b.createdAt),
        },
      },
      { upsert: true, timestamps: false }
    );
  }

  // ---------- BookingDetails ----------
  console.log('[seed] upserting booking details...');
  for (const d of data.bookingDetails || []) {
    const _id = toObjectId(d._id);
    await models.BookingDetail.updateOne(
      { _id },
      {
        $set: {
          bookingID: toObjectId(d.bookingId),
          // fieldID is Mixed: we store as string to be matched by both styles
          fieldID: String(d.fieldId),
          fieldName: d.fieldName || '',
          fieldImage: d.fieldImage || '',
          startTime: new Date(d.startTime),
          endTime: new Date(d.endTime),
          priceSnapShot: Number(d.priceSnapShot || 0),
          status: d.status || 'Active',
          createdAt: isoOrNow(d.createdAt),
          updatedAt: isoOrNow(d.updatedAt || d.createdAt),
        },
      },
      { upsert: true, timestamps: false }
    );
  }

  // ---------- Transactions ----------
  console.log('[seed] upserting transactions...');
  for (const t of data.transactions || []) {
    const _id = toObjectId(t._id);
    await models.Transaction.updateOne(
      { _id },
      {
        $set: {
          bookingID: toObjectId(t.bookingId),
          fromWalletID: t.fromWalletId && mongoose.isValidObjectId(String(t.fromWalletId)) ? toObjectId(t.fromWalletId) : undefined,
          toWalletID: t.toWalletId && mongoose.isValidObjectId(String(t.toWalletId)) ? toObjectId(t.toWalletId) : undefined,
          externalTransactionID: t.externalTransactionID || '',
          type: t.type,
          amount: Number(t.amount || 0),
          balanceBefore: Number(t.balanceBefore || 0),
          balanceAfter: Number(t.balanceAfter || 0),
          description: t.description || '',
          bookingType: t.bookingType || 'field',
          createdAt: isoOrNow(t.createdAt),
          updatedAt: isoOrNow(t.updatedAt || t.createdAt),
        },
      },
      { upsert: true, timestamps: false }
    );
  }

  console.log('[seed] done');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
