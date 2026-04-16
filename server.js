const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
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
    const { startAutoCompleteJob } = require('./utils/cronJobs');
    startAutoCompleteJob();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Load all models
require('./models');

  const routes = require('./routes')
  app.use(routes);

app.get('/', async(req, res)=>{
    try {
        res.send({message: 'Welcome to San Sieu Toc API!'});
    } catch (error) {
        res.send({error: error.message});
    }
});

const PORT = process.env.PORT || 9999;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));