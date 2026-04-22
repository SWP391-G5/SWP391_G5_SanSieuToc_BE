const express = require('express');
const router = express.Router();
const voucherController = require('../../controllers/owner/voucherController');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');

router.use(authenticate);
router.use(authorizeRoles(['Owner']));

router.get('/', voucherController.getVouchers);
router.post('/', voucherController.createVoucher);
router.put('/:id', voucherController.updateVoucher);
router.delete('/:id', voucherController.deleteVoucher);

module.exports = router;
