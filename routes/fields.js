const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authenticate');
const fieldsController = require('../controllers/fieldsController');

// Public routes (no auth required for viewing)
router.get('/', fieldsController.getAllFields);
router.get('/:fieldId', fieldsController.getFieldById);
router.get('/:fieldId/services', fieldsController.getFieldServices);
router.get('/:fieldId/full', fieldsController.getFieldWithServices);

module.exports = router;
