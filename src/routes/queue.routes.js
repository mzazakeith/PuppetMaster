const express = require('express');
const { StatusCodes } = require('http-status-codes');

const logger = require('../utils/logger');
const { getMetrics, getJobs, clearQueue } = require('../services/queue');
const { ApiError } = require('../middleware/errorHandler');

const router = express.Router();

// Get queue metrics
router.get('/metrics', async (req, res, next) => {
  try {
    const metrics = await getMetrics();
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      data: { metrics }
    });
  } catch (error) {
    next(error);
  }
});

// Get queue jobs by status
router.get('/jobs', async (req, res, next) => {
  try {
    const { 
      types = 'active,waiting,delayed,failed,completed', 
      limit = 10 
    } = req.query;
    
    const jobTypes = types.split(',');
    let jobs = await getJobs(jobTypes);
    
    // Limit the number of jobs returned
    jobs = jobs.slice(0, parseInt(limit));
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      data: {
        jobs: jobs.map(job => ({
          id: job.id,
          name: job.data.name || 'Unnamed Job',
          jobId: job.data.jobId,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          attempts: job.attemptsMade,
          state: jobTypes.find(type => job.queue.getJobCountByTypes(type).then(count => count > 0))
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// Clear the queue (admin only)
router.delete('/clear', async (req, res, next) => {
  try {
    // This should be protected with authentication in production
    await clearQueue();
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      message: 'Queue cleared successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Get worker status
router.get('/status', (req, res) => {
  // This is a simple check - in production you would want to
  // implement a more sophisticated health check for workers
  res.status(StatusCodes.OK).json({
    status: 'success',
    data: {
      isRunning: true,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage()
    }
  });
});

module.exports = router; 