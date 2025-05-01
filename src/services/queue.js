const Queue = require('bull');
const logger = require('../utils/logger');

// Create the job queues
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

// Create a separate queue for Crawl4AI jobs
const crawl4aiQueue = new Queue('crawl4ai-jobs', {
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

// Queue event listeners for Puppeteer
puppeteerQueue.on('error', (error) => {
  logger.error('Puppeteer queue error', { error: error.message, stack: error.stack });
});

puppeteerQueue.on('failed', (job, error) => {
  logger.error(`Puppeteer job ${job.id} failed`, { error: error.message, stack: error.stack, attempts: job.attemptsMade });
  
  // Log extra details about the failure
  if (error.name === 'MongooseError' && error.message.includes('timed out')) {
    logger.warn(`MongoDB timeout detected for job ${job.id}. Consider checking database connection and performance.`);
  }
});

puppeteerQueue.on('completed', (job) => {
  logger.info(`Puppeteer job ${job.id} completed`, { 
    jobId: job.data.jobId,
    processingTime: job.finishedOn - job.processedOn
  });
});

puppeteerQueue.on('stalled', (job) => {
  logger.warn(`Puppeteer job ${job.id} stalled`, { jobId: job.data.jobId, attempts: job.attemptsMade });
});

// Queue event listeners for Crawl4AI
crawl4aiQueue.on('error', (error) => {
  logger.error('Crawl4AI queue error', { error: error.message, stack: error.stack });
});

crawl4aiQueue.on('failed', (job, error) => {
  logger.error(`Crawl4AI job ${job.id} failed`, { error: error.message, stack: error.stack, attempts: job.attemptsMade });
});

crawl4aiQueue.on('completed', (job) => {
  logger.info(`Crawl4AI job ${job.id} completed`, { 
    jobId: job.data.jobId,
    processingTime: job.finishedOn - job.processedOn
  });
});

crawl4aiQueue.on('stalled', (job) => {
  logger.warn(`Crawl4AI job ${job.id} stalled`, { jobId: job.data.jobId, attempts: job.attemptsMade });
});

// Helper to determine if a job should use the Crawl4AI queue
const isCrawl4AIJob = (jobData) => {
  // Check if any of the actions are Crawl4AI actions
  const crawl4aiActionTypes = [
    'crawl', 'extract', 'generateSchema', 'verify', 'crawlLinks',
    'filter', 'extractPDF'
  ];
  
  return jobData.actions && jobData.actions.some(action => 
    crawl4aiActionTypes.includes(action.type)
  );
};

// Add a job to the appropriate queue
const addJob = async (jobData, options = {}) => {
  const queue = isCrawl4AIJob(jobData) ? crawl4aiQueue : puppeteerQueue;
  const queueName = isCrawl4AIJob(jobData) ? 'Crawl4AI' : 'Puppeteer';
  
  const job = await queue.add(jobData, {
    priority: options.priority || 0,
    delay: options.delay || 0,
    attempts: options.attempts,
    timeout: options.timeout,
  });
  
  logger.info(`${queueName} job ${job.id} added to queue`);
  return job;
};

// Get job details from the queue
const getJob = async (jobId) => {
  // Try to find job in either queue
  let job = await puppeteerQueue.getJob(jobId);
  if (!job) {
    job = await crawl4aiQueue.getJob(jobId);
  }
  return job;
};

// Get all jobs with various states from both queues
const getJobs = async (types = ['active', 'waiting', 'completed', 'failed']) => {
  const puppeteerJobs = await Promise.all(types.map(type => puppeteerQueue.getJobs([type])));
  const crawl4aiJobs = await Promise.all(types.map(type => crawl4aiQueue.getJobs([type])));
  
  // Combine jobs from both queues
  return [...puppeteerJobs.flat(), ...crawl4aiJobs.flat()];
};

// Remove a job from the appropriate queue
const removeJob = async (jobId) => {
  // Try to remove from Puppeteer queue first
  let job = await puppeteerQueue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info(`Puppeteer job ${jobId} removed from queue`);
    return true;
  }
  
  // Try to remove from Crawl4AI queue
  job = await crawl4aiQueue.getJob(jobId);
  if (job) {
    await job.remove();
    logger.info(`Crawl4AI job ${jobId} removed from queue`);
    return true;
  }
  
  return false;
};

// Clear all jobs from both queues
const clearQueue = async () => {
  await puppeteerQueue.empty();
  await crawl4aiQueue.empty();
  logger.info('All queues emptied');
};

// Get queue metrics from both queues
const getMetrics = async () => {
  const [
    puppeteerWaiting,
    puppeteerActive,
    puppeteerCompleted,
    puppeteerFailed,
    puppeteerDelayed,
    crawl4aiWaiting,
    crawl4aiActive,
    crawl4aiCompleted,
    crawl4aiFailed,
    crawl4aiDelayed
  ] = await Promise.all([
    puppeteerQueue.getWaitingCount(),
    puppeteerQueue.getActiveCount(),
    puppeteerQueue.getCompletedCount(),
    puppeteerQueue.getFailedCount(),
    puppeteerQueue.getDelayedCount(),
    crawl4aiQueue.getWaitingCount(),
    crawl4aiQueue.getActiveCount(),
    crawl4aiQueue.getCompletedCount(),
    crawl4aiQueue.getFailedCount(),
    crawl4aiQueue.getDelayedCount()
  ]);

  return {
    puppeteer: {
      waiting: puppeteerWaiting,
      active: puppeteerActive,
      completed: puppeteerCompleted,
      failed: puppeteerFailed,
      delayed: puppeteerDelayed,
      total: puppeteerWaiting + puppeteerActive + puppeteerCompleted + puppeteerFailed + puppeteerDelayed
    },
    crawl4ai: {
      waiting: crawl4aiWaiting,
      active: crawl4aiActive,
      completed: crawl4aiCompleted,
      failed: crawl4aiFailed,
      delayed: crawl4aiDelayed,
      total: crawl4aiWaiting + crawl4aiActive + crawl4aiCompleted + crawl4aiFailed + crawl4aiDelayed
    },
    total: {
      waiting: puppeteerWaiting + crawl4aiWaiting,
      active: puppeteerActive + crawl4aiActive,
      completed: puppeteerCompleted + crawl4aiCompleted,
      failed: puppeteerFailed + crawl4aiFailed,
      delayed: puppeteerDelayed + crawl4aiDelayed,
      total: (puppeteerWaiting + puppeteerActive + puppeteerCompleted + puppeteerFailed + puppeteerDelayed) +
             (crawl4aiWaiting + crawl4aiActive + crawl4aiCompleted + crawl4aiFailed + crawl4aiDelayed)
    }
  };
};

module.exports = {
  puppeteerQueue,
  crawl4aiQueue,
  addJob,
  getJob,
  getJobs,
  removeJob,
  clearQueue,
  getMetrics
}; 