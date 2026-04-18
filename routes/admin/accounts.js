const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const accountController = require('../../controllers/admin/accountController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Admin']));

// Manager accounts (AdminAccount + Role=Manager)
router.get('/accounts/managers', asyncHandler(accountController.listManagers));
router.post('/accounts/managers', asyncHandler(accountController.createManager));
router.patch('/accounts/managers/:id/deactivate', asyncHandler(accountController.deactivateManager));
router.patch('/accounts/managers/:id/delete', asyncHandler(accountController.deleteManager));
router.patch('/accounts/managers/:id/restore', asyncHandler(accountController.restoreManager));

// Owner accounts (UserAccount + Role=Owner)
router.get('/accounts/owners', asyncHandler(accountController.listOwners));
router.post('/accounts/owners', asyncHandler(accountController.createOwner));
router.patch('/accounts/owners/:id/deactivate', asyncHandler(accountController.deactivateOwner));
router.post('/accounts/owners/:id/request-delete', asyncHandler(accountController.requestDeleteOwner));
router.patch('/accounts/owners/:id/restore', asyncHandler(accountController.restoreOwner));

// Customer accounts (UserAccount + Role=Customer)
router.get('/accounts/customers', asyncHandler(accountController.listCustomers));
router.patch('/accounts/customers/:id/ban', asyncHandler(accountController.banCustomer));
router.patch('/accounts/customers/:id/unban', asyncHandler(accountController.unbanCustomer));

module.exports = router;
