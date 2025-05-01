const Queue = require('bull');
const logger = require('../utils/logger');

// Create the job queue
const puppeteerQueue = new Queue('puppeteer-jobs', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,

    connectTimeout: 30000
  },
  defaultJobOptions: {
    attempts: parseInt(process.env.JOB_ATTEMPTS) || 3,
    timeout: parseInt(process.env.JOB_TIMEOUT) || 300000, // 5 minutes
    removeOnComplete: false,
    removeOnFail: false,
    backoff: {
      type: 'exponential',
      delay: 5000 // 5 seconds initial delay, then exponential
    }
  }
});

// Queue event listeners
puppeteerQueue.on('error', (error) => {
  logger.error('Queue error', { error: error.message, stack: error.stack });
});

puppeteerQueue.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed`, { error: error.message, stack: error.stack, attempts: job.attemptsMade });
  
  // Log extra details about the failure
  if (error.name === 'MongooseError' && error.message.includes('timed out')) {
    logger.warn(`MongoDB timeout detected for job ${job.id}. Consider checking database connection and performance.`);
  }
});

puppeteerQueue.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`, { 
    jobId: job.data.jobId,
    processingTime: job.finishedOn - job.processedOn
  });
});

puppeteerQueue.on('stalled', (job) => {
  logger.warn(`Job ${job.id} stalled`, { jobId: job.data.jobId, attempts: job.attemptsMade });
});

// Add a job to the queue
const addJob = async (jobData, options = {}) => {
  const job = await puppeteerQueue.add(jobData, {
    priority: options.priority || 0,
    delay: options.delay || 0,
    attempts: options.attempts,
    timeout: options.timeout,
  });
  
  logger.info(`Job ${job.id} added to queue`);
  return job;
};

// Get job details from the queue
const getJob = async (jobId) => {
  return await puppeteerQueue.getJob(jobId);
};

// Get all jobs with various states
const getJobs = async (types = ['active', 'waiting', 'completed', 'failed']) => {
  const jobs = await Promise.all(types.map(type => puppeteerQueue.getJobs([type])));
  return jobs.flat();
};

// Remove a job from the queue
const removeJob = async (jobId) => {
  const job = await puppeteerQueue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info(`Job ${jobId} removed from queue`);
    return true;
  }
  return false;
};

// Clear all jobs from the queue
const clearQueue = async () => {
  await puppeteerQueue.empty();
  logger.info('Queue emptied');
};

// Get queue metrics
const getMetrics = async () => {
  const [
    waitingCount,
    activeCount,
    completedCount,
    failedCount,
    delayedCount
  ] = await Promise.all([
    puppeteerQueue.getWaitingCount(),
    puppeteerQueue.getActiveCount(),
    puppeteerQueue.getCompletedCount(),
    puppeteerQueue.getFailedCount(),
    puppeteerQueue.getDelayedCount()
  ]);

  return {
    waiting: waitingCount,
    active: activeCount,
    completed: completedCount,
    failed: failedCount,
    delayed: delayedCount,
    total: waitingCount + activeCount + completedCount + failedCount + delayedCount
  };
};

module.exports = {
  puppeteerQueue,
  addJob,
  getJob,
  getJobs,
  removeJob,
  clearQueue,
  getMetrics
}; 