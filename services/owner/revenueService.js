const Field = require('../../models/Field');
const Service = require('../../models/Service');
const BookingServiceHistory = require('../../models/BookingServiceHistory');
const BookingDetail = require('../../models/BookingDetail');

function startOfDay(date) {
   const d = new Date(date);
   d.setHours(0, 0, 0, 0);
   return d;
}

function endOfDay(date) {
   const d = new Date(date);
   d.setHours(23, 59, 59, 999);
   return d;
}

function normalizePeriod(periodRaw) {
   const p = String(periodRaw || '').trim().toLowerCase();
   if (p === 'week' || p === 'month' || p === 'year') return p;
   return 'week';
}

function normalizeSortBy(sortByRaw) {
   const v = String(sortByRaw || '').trim().toLowerCase();
   if (v === 'revenue') return 'revenue';
   return 'quantity';
}

function resolveRange(period) {
   const now = new Date();
   const end = endOfDay(now);

   const daysByPeriod = {
      week: 7,
      month: 30,
      year: 365,
   };

   const days = daysByPeriod[period] || 7;
   const start = startOfDay(new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000));

   return { from: start, to: end };
}

async function getOwnerFields(ownerId) {
   const fields = await Field.find({ ownerID: ownerId, status: { $ne: 'Deleted' } })
      .select('_id fieldName')
      .lean();
   return fields || [];
}

async function getInventoryByField(ownerId) {
   const fields = await getOwnerFields(ownerId);
   if (!fields.length) return [];

   const fieldIds = fields.map((f) => f._id);
   const stockAgg = await Service.aggregate([
      { $match: { fieldID: { $in: fieldIds } } },
      {
         $group: {
            _id: '$fieldID',
            totalStock: { $sum: '$stock' },
            serviceCount: { $sum: 1 },
         },
      },
   ]);

   const stockMap = new Map(stockAgg.map((row) => [String(row._id), row]));

   return fields.map((f) => {
      const row = stockMap.get(String(f._id));
      return {
         fieldId: f._id,
         fieldName: f.fieldName,
         totalStock: row?.totalStock || 0,
         serviceCount: row?.serviceCount || 0,
      };
   });
}

async function getTopServicesByField(ownerId, periodRaw = 'week', limitRaw = 5, sortByRaw = 'quantity') {
   const fields = await getOwnerFields(ownerId);
   if (!fields.length) {
      return { period: normalizePeriod(periodRaw), range: resolveRange(normalizePeriod(periodRaw)), items: [] };
   }

   const period = normalizePeriod(periodRaw);
   const range = resolveRange(period);
   const limit = Math.max(1, Number(limitRaw) || 5);
   const sortBy = normalizeSortBy(sortByRaw);

   const fieldIdsStr = fields.map((f) => String(f._id));
   const sortField = sortBy === 'revenue' ? 'totalRevenue' : 'totalQty';

   const results = await BookingServiceHistory.aggregate([
      {
         $match: {
            status: { $ne: 'Cancelled' },
            createdAt: { $gte: range.from, $lte: range.to },
         },
      },
      {
         $lookup: {
            from: 'bookingdetails',
            localField: 'bookingDetailID',
            foreignField: '_id',
            as: 'detail',
         },
      },
      { $unwind: '$detail' },
      {
         $addFields: {
            fieldIdStr: { $toString: '$detail.fieldID' },
         },
      },
      { $match: { fieldIdStr: { $in: fieldIdsStr } } },
      { $unwind: '$service' },
      {
         $group: {
            _id: {
               fieldIdStr: '$fieldIdStr',
               serviceId: '$service.serviceId',
               serviceName: '$service.serviceName',
            },
            totalQty: { $sum: '$service.quantity' },
            totalRevenue: { $sum: { $multiply: ['$service.price', '$service.quantity'] } },
         },
      },
      { $sort: { [sortField]: -1 } },
      {
         $group: {
            _id: '$_id.fieldIdStr',
            items: {
               $push: {
                  serviceId: '$_id.serviceId',
                  serviceName: '$_id.serviceName',
                  totalQty: '$totalQty',
                  totalRevenue: '$totalRevenue',
               },
            },
         },
      },
   ]);

   const itemsByField = new Map(results.map((row) => [String(row._id), row.items || []]));

   const items = fields.map((f) => {
      const list = itemsByField.get(String(f._id)) || [];
      return {
         fieldId: f._id,
         fieldName: f.fieldName,
         topServices: list.slice(0, limit),
      };
   });

   return { period, range, items, sortBy };
}

async function getFieldDetail(ownerId, fieldId, periodRaw = 'week', limitRaw = 10) {
   if (!fieldId) {
      return { status: 400, body: { message: 'fieldId is required.' } };
   }

   const field = await Field.findOne({ _id: fieldId, ownerID: ownerId, status: { $ne: 'Deleted' } })
      .select('_id fieldName')
      .lean();
   if (!field) {
      return { status: 404, body: { message: 'Field not found.' } };
   }

   const period = normalizePeriod(periodRaw);
   const range = resolveRange(period);
   const limit = Math.max(1, Number(limitRaw) || 10);
   const fieldIdStr = String(field._id);

   const services = await Service.find({ fieldID: field._id })
      .select('_id serviceName stock price image')
      .sort({ createdAt: -1 })
      .lean();

   const [fieldRevenueAgg] = await BookingDetail.aggregate([
      {
         $addFields: {
            fieldIdStr: { $toString: '$fieldID' },
         },
      },
      {
         $match: {
            fieldIdStr,
            status: { $ne: 'Cancel' },
            createdAt: { $gte: range.from, $lte: range.to },
         },
      },
      {
         $group: {
            _id: null,
            total: { $sum: '$priceSnapShot' },
            count: { $sum: 1 },
         },
      },
   ]);

   const [serviceRevenueAgg] = await BookingServiceHistory.aggregate([
      {
         $match: {
            status: { $ne: 'Cancelled' },
            createdAt: { $gte: range.from, $lte: range.to },
         },
      },
      {
         $lookup: {
            from: 'bookingdetails',
            localField: 'bookingDetailID',
            foreignField: '_id',
            as: 'detail',
         },
      },
      { $unwind: '$detail' },
      {
         $addFields: {
            fieldIdStr: { $toString: '$detail.fieldID' },
         },
      },
      { $match: { fieldIdStr } },
      {
         $group: {
            _id: null,
            total: { $sum: '$totalPriceSnapShot' },
            count: { $sum: 1 },
         },
      },
   ]);

   const history = await BookingServiceHistory.aggregate([
      {
         $match: {
            status: { $ne: 'Cancelled' },
            createdAt: { $gte: range.from, $lte: range.to },
         },
      },
      {
         $lookup: {
            from: 'bookingdetails',
            localField: 'bookingDetailID',
            foreignField: '_id',
            as: 'detail',
         },
      },
      { $unwind: '$detail' },
      {
         $addFields: {
            fieldIdStr: { $toString: '$detail.fieldID' },
         },
      },
      { $match: { fieldIdStr } },
      { $sort: { createdAt: -1 } },
      { $limit: limit },
      {
         $project: {
            _id: 1,
            createdAt: 1,
            totalPriceSnapShot: 1,
            service: 1,
            detail: {
               startTime: '$detail.startTime',
               endTime: '$detail.endTime',
               status: '$detail.status',
               fieldName: '$detail.fieldName',
            },
         },
      },
   ]);

   const fieldRevenue = fieldRevenueAgg?.total || 0;
   const serviceRevenue = serviceRevenueAgg?.total || 0;

   return {
      field: {
         id: field._id,
         name: field.fieldName,
      },
      period,
      range,
      inventory: services || [],
      history: history || [],
      revenue: {
         fieldRevenue,
         serviceRevenue,
         totalRevenue: fieldRevenue + serviceRevenue,
      },
   };
}

module.exports = {
   getInventoryByField,
   getTopServicesByField,
   getFieldDetail,
};
