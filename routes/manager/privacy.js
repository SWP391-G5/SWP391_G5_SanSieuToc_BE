/**
 * routes/manager/privacy.js
 * Manager/Admin routes for privacy policies CRUD.
 */

const express = require('express');

const asyncHandler = require('../../middlewares/asyncHandler');
const authenticate = require('../../middlewares/authenticate');
const authorizeRoles = require('../../middlewares/authorize');

const privacyController = require('../../controllers/manager/privacyController');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Manager']));

router.get('/', asyncHandler(privacyController.listPrivacies));
router.post('/', asyncHandler(privacyController.createPrivacy));
router.put('/:id', asyncHandler(privacyController.updatePrivacy));
router.delete('/:id', asyncHandler(privacyController.deletePrivacy));

module.exports = router;
