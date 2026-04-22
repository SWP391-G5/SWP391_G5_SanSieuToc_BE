const cron = require('node-cron');

const Role = require('../models/Role');
const AdminAccount = require('../models/AdminAccount');
const UserAccount = require('../models/UserAccount');
const Booking = require('../models/Booking');
const BookingDetail = require('../models/BookingDetail');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');

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
          { $set: { status: 'Ended' } }
        );
        
        if (result.modifiedCount > 0) {
          console.log(`[AutoComplete] Updated ${result.modifiedCount} booking details to Ended status`);
          
          const endedDetails = await BookingDetail.find(
            { status: 'Ended' }
          ).select('bookingID');
          
          const bookingIds = [...new Set(endedDetails.map(d => d.bookingID.toString()))];
          
          for (const bookingId of bookingIds) {
            const activeDetails = await BookingDetail.countDocuments({
              bookingID: bookingId,
              status: 'Active'
            });
            
            if (activeDetails === 0) {
              await Booking.findByIdAndUpdate(bookingId, {
                status: 'Ended',
                finalDate: now
              });
            }
          }
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

module.exports = { startAutoCompleteJob, startOwnerDeletionJob, startManagerDeletionJob, startWithdrawJob };

let withdrawJobStarted = false;
function startWithdrawJob() {
  if (withdrawJobStarted) return;
  withdrawJobStarted = true;

  cron.schedule(
    '*/15 * * * *', // Chạy mỗi 15 phút
    async () => {
      try {
        const now = new Date();
        
        const pendingWithdraws = await Transaction.find({
          type: 'Withdraw',
          withdrawStatus: 'Pending',
          scheduledAt: { $lte: now }
        }).lean();

        if (pendingWithdraws.length > 0) {
          console.log(`[Withdraw] Processing ${pendingWithdraws.length} pending withdrawals`);
          
          for (const withdraw of pendingWithdraws) {
            try {
              // Trừ tiền từ wallet
              const wallet = await Wallet.findById(withdraw.fromWalletID);
              if (wallet) {
                const balanceBefore = wallet.balance;
                wallet.balance += withdraw.amount; // amount âm nên sẽ trừ
                await wallet.save();

                // Update transaction status
                await Transaction.findByIdAndUpdate(withdraw._id, {
                  withdrawStatus: 'Completed',
                  balanceAfter: wallet.balance,
                });

                console.log(`[Withdraw] Completed withdrawal ${withdraw._id}: ${withdraw.amount} VND`);
              }
            } catch (err) {
              console.error(`[Withdraw] Error processing ${withdraw._id}:`, err.message);
            }
          }
        }
      } catch (err) {
        console.error('[Withdraw] Error:', err.message);
      }
    },
    { timezone: 'Asia/Ho_Chi_Minh' }
  );
  console.log('[Cron] Withdraw job started - processes pending withdrawals after 12h');
}
