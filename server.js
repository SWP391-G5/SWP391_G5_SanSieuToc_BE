const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const errorHandler = require('./middlewares/errorHandler');
const app = express();

// ============================================
// CORS Configuration - Cho phép Frontend truy cập API
// ============================================
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    
    // Start cron jobs after DB connection
    const { startAutoCompleteJob, startOwnerDeletionJob, startManagerDeletionJob } = require('./utils/cronJobs');
    startAutoCompleteJob();
    startOwnerDeletionJob();
    startManagerDeletionJob();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Load all models
require('./models');

const routes = require('./routes');
app.use(routes);

app.get('/', async (req, res) => {
  try {
    res.send({ message: 'Welcome to San Sieu Toc API!' });
  } catch (error) {
    res.send({ error: error.message });
  }
});

// Global error handler (JSON)
app.use(errorHandler);

const PORT = process.env.PORT || 9999;

// ============================================
// Error Handler Middleware
// ============================================
app.use((err, req, res, next) => {
  console.error('Error:', err);

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    success: false,
    message: message,
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));