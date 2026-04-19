/**
 * routes/manager/scope.js
 * List manager scoped resources (assigned owners & their fields).
 */

const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');
const scopeController = require('../../controllers/manager/scopeController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Manager']));

router.get('/owners', asyncHandler(scopeController.listManagedOwners));

module.exports = router;
