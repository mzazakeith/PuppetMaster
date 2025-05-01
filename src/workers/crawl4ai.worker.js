require('dotenv').config();
const axios = require('axios');
const logger = require('../utils/logger');
const Job = require('../models/Job');

/**
 * Worker for handling Crawl4AI jobs
 * This worker sends jobs to the Python microservice and handles the responses
 */

// Configure API client
const CRAWL4AI_API_URL = process.env.CRAWL4AI_API_URL || 'http://localhost:8000';
const apiClient = axios.create({
  baseURL: CRAWL4AI_API_URL,
  timeout: parseInt(process.env.CRAWL4AI_API_TIMEOUT) || 60000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Action to endpoint mapping
const ACTION_ENDPOINTS = {
  'crawl': '/crawl4ai/crawl',
  'extract': '/crawl4ai/extract',
  'generateSchema': '/crawl4ai/generate-schema',
  'verify': '/crawl4ai/verify',
  'crawlLinks': '/crawl4ai/crawl-links',
  'wait': '/crawl4ai/wait',
  'filter': '/crawl4ai/filter',
  'screenshot': '/crawl4ai/screenshot',
  'extractPDF': '/crawl4ai/extract-pdf',
  'toMarkdown': '/crawl4ai/to-markdown',
  'toPDF': '/crawl4ai/to-pdf'
};

/**
 * Process a Crawl4AI job
 * @param {Object} job - Job object from Bull queue
 * @returns {Promise<Object>} - Processing result
 */
async function processJob(job) {
  let dbJob = null;

  try {
    logger.info(`Processing Crawl4AI job ${job.id}`);
    
    // Find the job in the database
    try {
      dbJob = await Job.findOne({ jobId: job.data.jobId });
      
      if (!dbJob) {
        throw new Error(`Job ${job.data.jobId} not found in database`);
      }
      
      // Update job status
      dbJob.status = 'processing';
      dbJob.startedAt = new Date();
      await dbJob.save();
      
    } catch (dbError) {
      logger.error(`Database error when finding job ${job.data.jobId}: ${dbError.message}`, {
        stack: dbError.stack,
        jobId: job.data.jobId
      });
      throw dbError;
    }
    
    // Process each action
    const actions = job.data.actions;
    const results = {};
    const assets = [];
    
    logger.info(`Processing ${actions.length} actions...`);
    
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      
      try {
        logger.info(`Executing action ${i+1}: ${action.type}`);
        
        // Update action status
        dbJob.actions[i].startedAt = new Date();
        await dbJob.save();
        
        // Record start time
        const startTime = Date.now();
        
        // Execute the action
        const result = await executeAction(action);
        
        // Calculate duration
        const duration = Date.now() - startTime;
        
        // Store result
        results[`action_${i}`] = result;
        
        // Update action in database
        dbJob.actions[i].result = result;
        dbJob.actions[i].duration = duration;
        dbJob.actions[i].completedAt = new Date();
        
        // For screenshot and PDF actions, record asset URLs
        if (action.type === 'screenshot' || action.type === 'extractPDF') {
          if (result.url || (result.data && result.data.url)) {
            assets.push({
              type: action.type,
              url: result.url || result.data.url,
              createdAt: new Date()
            });
          }
        }
        
        // Update progress
        dbJob.progress = Math.floor(((i + 1) / actions.length) * 100);
        await dbJob.save();
        
      } catch (error) {
        // Update action error in database
        logger.error(`Error in action ${i+1} (${action.type}): ${error.message}`, { 
          stack: error.stack,
          action: action 
        });
        
        // Make sure to use the correct error structure
        dbJob.actions[i].error = {
          message: error.message,
          stack: error.stack,
          code: error.code || ''
        };
        
        dbJob.actions[i].completedAt = new Date();
        await dbJob.save();
        
        // Fail the job
        throw error;
      }
    }
    
    // Update job in database
    dbJob.status = 'completed';
    dbJob.results = results;
    dbJob.assets = assets;
    dbJob.completedAt = new Date();
    dbJob.progress = 100;
    await dbJob.save();
    
    logger.info(`Job ${job.id} completed successfully`);
    return { success: true, results, assets };
    
  } catch (error) {
    logger.error(`Error processing job ${job.id}: ${error.message}`, { 
      stack: error.stack,
      jobData: job.data 
    });
    
    // Update job status in database if we have a valid job object
    if (dbJob) {
      dbJob.status = 'failed';
      dbJob.error = {
        message: error.message,
        stack: error.stack,
        code: error.code || ''
      };
      dbJob.attempts += 1;
      dbJob.completedAt = new Date();
      
      try {
        await dbJob.save();
      } catch (saveError) {
        logger.error(`Error saving failed job status: ${saveError.message}`, { 
          stack: saveError.stack,
          jobId: job.data.jobId
        });
      }
    }
    
    // Rethrow to mark job as failed
    throw error;
  }
}

/**
 * Execute a Crawl4AI action by calling the Python microservice API
 * @param {Object} action - Action object with type and params
 * @returns {Promise<Object>} - Action result
 */
async function executeAction(action) {
  const { type, params } = action;
  
  if (!ACTION_ENDPOINTS[type]) {
    throw new Error(`Unknown action type: ${type}`);
  }
  
  try {
    const endpoint = ACTION_ENDPOINTS[type];
    
    // Make API request to Crawl4AI microservice
    const response = await apiClient.post(endpoint, params);
    
    return response.data;
  } catch (error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      throw new Error(`Crawl4AI API error: ${error.response.data.error || error.response.data.detail || error.message}`);
    } else if (error.request) {
      // The request was made but no response was received
      throw new Error(`Crawl4AI API connection error: ${error.message}`);
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`Crawl4AI request error: ${error.message}`);
    }
  }
}

/**
 * Check if Crawl4AI service is running
 * @returns {Promise<boolean>} - True if service is running
 */
async function checkServiceHealth() {
  try {
    const response = await apiClient.get('/health');
    return response.data.status === 'ok';
  } catch (error) {
    logger.error(`Crawl4AI health check failed: ${error.message}`);
    return false;
  }
}

module.exports = {
  processJob,
  checkServiceHealth
}; 