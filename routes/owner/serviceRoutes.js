const express = require('express');
const router = express.Router();
const serviceController = require('../../controllers/owner/serviceController');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const asyncHandler = require('../../middlewares/asyncHandler');

// Tất cả routes bên dưới yêu cầu đăng nhập + role Owner
router.use(authenticate, authorizeRoles(['Owner']));

router.get('/', asyncHandler(serviceController.getServicesByField));
router.post('/', asyncHandler(serviceController.createService));
router.put('/:id', asyncHandler(serviceController.updateService));
router.delete('/:id', asyncHandler(serviceController.deleteService));

module.exports = router;
