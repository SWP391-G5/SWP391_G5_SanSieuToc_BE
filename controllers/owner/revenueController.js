const { getInventoryByField, getTopServicesByField, getFieldDetail } = require('../../services/owner/revenueService');

async function getInventory(req, res) {
  const ownerId = req.user?.sub || req.user?.id || req.user?._id;
  const items = await getInventoryByField(ownerId);
  return res.json({ items });
}

async function getTopServices(req, res) {
  const ownerId = req.user?.sub || req.user?.id || req.user?._id;
  const { period, limit } = req.query;

  const result = await getTopServicesByField(ownerId, period, limit);

  return res.json({
    period: result.period,
    from: result.range?.from,
    to: result.range?.to,
    items: result.items,
  });
}

module.exports = {
  getInventory,
  getTopServices,
  getFieldDetail: async (req, res) => {
    const ownerId = req.user?.sub || req.user?.id || req.user?._id;
    const { fieldId } = req.params;
    const { period, limit } = req.query;

    const result = await getFieldDetail(ownerId, fieldId, period, limit);
    if (result?.status) return res.status(result.status).json(result.body);

    return res.json(result);
  },
};
