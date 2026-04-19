const cron = require('node-cron');

const Role = require('../models/Role');
const AdminAccount = require('../models/AdminAccount');
const UserAccount = require('../models/UserAccount');
const BookingDetail = require('../models/BookingDetail');

let autoCompleteJobStarted = false;
function startAutoCompleteJob() {
  if (autoCompleteJobStarted) return;
  autoCompleteJobStarted = true;

  cron.schedule(
    '* * * * *',
    async () => {
      try {
        const now = new Date();
        
        const result = await BookingDetail.updateMany(
          { 
            status: 'Active',
            endTime: { $lte: now }
          },
          { $set: { status: 'End' } }
        );
        
        if (result.modifiedCount > 0) {
          console.log(`[AutoComplete] Updated ${result.modifiedCount} booking details to End status`);
        }
      } catch (err) {
        console.error('[AutoComplete] Error:', err.message);
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );
  console.log('[Cron] AutoComplete job started - updates booking status to Ended');
}

let ownerDeletionJobStarted = false;
function startOwnerDeletionJob() {
  if (ownerDeletionJobStarted) return;
  ownerDeletionJobStarted = true;

  // Run hourly. Soft-delete Owner after scheduledAt.
  // Note: This does NOT touch the Owner's Wallet, so restoring the account keeps the same wallet balance.
  cron.schedule(
    '0 * * * *',
    async () => {
      try {
        const roleDoc = await Role.findOne({ name: new RegExp('^Owner$', 'i') });
        if (!roleDoc) return;

        const now = new Date();
        const dueOwners = await UserAccount.find({
          roleID: roleDoc._id,
          status: { $ne: 'Deleted' },
          'deletion.scheduledAt': { $lte: now },
        }).select('_id');

        for (const owner of dueOwners) {
          await UserAccount.updateOne(
            { _id: owner._id },
            {
              $set: { status: 'Deleted' },
              $unset: { deletion: '' },
            }
          );
        }
      } catch {
        // ignore cron errors
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );
}

let managerDeletionJobStarted = false;
function startManagerDeletionJob() {
  if (managerDeletionJobStarted) return;
  managerDeletionJobStarted = true;

  // Run hourly. Soft-delete Manager (AdminAccount) after scheduledAt.
  // Note: This does NOT touch the Manager's Wallet.
  cron.schedule(
    '0 * * * *',
    async () => {
      try {
        const roleDoc = await Role.findOne({ name: new RegExp('^Manager$', 'i') });
        if (!roleDoc) return;

        const now = new Date();
        const dueManagers = await AdminAccount.find({
          roleID: roleDoc._id,
          status: { $ne: 'Deleted' },
          'deletion.scheduledAt': { $lte: now },
        }).select('_id');

        for (const manager of dueManagers) {
          await AdminAccount.updateOne(
            { _id: manager._id },
            {
              $set: { status: 'Deleted' },
              $unset: { deletion: '' },
            }
          );
        }
      } catch {
        // ignore cron errors
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );
}

module.exports = { startAutoCompleteJob, startOwnerDeletionJob, startManagerDeletionJob };
