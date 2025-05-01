const express = require('express');
const jobRoutes = require('./jobs.routes');
const queueRoutes = require('./queue.routes');

const router = express.Router();

// API documentation route
router.get('/', (req, res) => {
  res.json({
    service: 'PuppetMaster API',
    version: '1.0.0',
    endpoints: {
      '/jobs': 'Manage puppet jobs',
      '/queue': 'Queue and worker status'
    }
  });
});

// Mount routes
router.use('/jobs', jobRoutes);
router.use('/queue', queueRoutes);

module.exports = router; 