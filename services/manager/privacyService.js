/**
 * privacyService.js (Manager)
 * Business logic for Manager/Admin to manage system privacy policies.
 * CRUD (hard delete).
 */

const mongoose = require('mongoose');

const Privacy = require('../../models/Privacy');

const MAX_TITLE = 200;
const MAX_CONTENT = 10000;

function toObjectId(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

function normalizeString(v) {
  return String(v ?? '').trim();
}

function validatePayload(payload) {
  const privacyName = normalizeString(payload?.privacyName);
  const privacyContent = normalizeString(payload?.privacyContent);

  if (!privacyName) {
    return { ok: false, message: 'privacyName is required' };
  }

  if (privacyName.length > MAX_TITLE) {
    return { ok: false, message: `privacyName must be <= ${MAX_TITLE} chars` };
  }

  if (privacyContent.length > MAX_CONTENT) {
    return { ok: false, message: `privacyContent must be <= ${MAX_CONTENT} chars` };
  }

  return { ok: true, privacyName, privacyContent };
}

async function listPrivacies() {
  const items = await Privacy.find({})
    .sort({ updatedAt: -1, _id: -1 })
    .lean();

  return { items };
}

async function createPrivacy(managerId, payload) {
  const managerObjectId = toObjectId(managerId);
  if (!managerObjectId) return { status: 401, body: { message: 'Unauthorized' } };

  const v = validatePayload(payload);
  if (!v.ok) return { status: 400, body: { message: v.message } };

  const created = await Privacy.create({
    managerID: managerObjectId,
    privacyName: v.privacyName,
    privacyContent: v.privacyContent,
  });

  return { status: 201, body: created };
}

async function updatePrivacy(managerId, privacyId, payload) {
  const managerObjectId = toObjectId(managerId);
  if (!managerObjectId) return { status: 401, body: { message: 'Unauthorized' } };

  const id = toObjectId(privacyId);
  if (!id) return { status: 400, body: { message: 'Invalid id' } };

  const v = validatePayload(payload);
  if (!v.ok) return { status: 400, body: { message: v.message } };

  // Optimistic concurrency: client must send __v they last fetched
  const expectedVersionRaw = payload?.__v;
  const expectedVersion = Number.isFinite(Number(expectedVersionRaw)) ? Number(expectedVersionRaw) : null;
  if (expectedVersion === null) {
    return { status: 400, body: { message: 'Missing __v for concurrency control.' } };
  }

  const updated = await Privacy.findOneAndUpdate(
    { _id: id, __v: expectedVersion },
    {
      $set: {
        managerID: managerObjectId,
        privacyName: v.privacyName,
        privacyContent: v.privacyContent,
      },
      $inc: { __v: 1 },
    },
    { new: true }
  );

  if (!updated) {
    const exists = await Privacy.exists({ _id: id });
    if (!exists) return { status: 404, body: { message: 'Privacy not found' } };
    return {
      status: 409,
      body: { message: 'This privacy was updated by someone else. Please refresh and try again.' },
    };
  }

  return { status: 200, body: updated };
}

async function deletePrivacy(managerId, privacyId) {
  const managerObjectId = toObjectId(managerId);
  if (!managerObjectId) return { status: 401, body: { message: 'Unauthorized' } };

  const id = toObjectId(privacyId);
  if (!id) return { status: 400, body: { message: 'Invalid id' } };

  const deleted = await Privacy.findOneAndDelete({ _id: id });
  if (!deleted) return { status: 404, body: { message: 'Privacy not found' } };

  return { status: 200, body: { message: 'Deleted' } };
}

module.exports = {
  listPrivacies,
  createPrivacy,
  updatePrivacy,
  deletePrivacy,
};
