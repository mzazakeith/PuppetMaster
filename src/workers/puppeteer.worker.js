require('dotenv').config(); // Load environment variables
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { puppeteerQueue } = require('../services/queue');
const Job = require('../models/Job');

// MongoDB Connection Logic
const connectToDatabase = async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/puppet-master';
  if (mongoose.connection.readyState >= 1) {
    logger.info('MongoDB connection already established.');
    return;
  }

  mongoose.connection.on('connected', () => logger.info('Worker connected to MongoDB'));
  mongoose.connection.on('error', (err) => logger.error('Worker MongoDB connection error:', err));
  mongoose.connection.on('disconnected', () => logger.warn('Worker disconnected from MongoDB'));

  try {
    logger.info('Worker attempting to connect to MongoDB...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000, 
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000, 
      maxPoolSize: 5, // Smaller pool for worker? Or keep same as main app? Let's keep it smaller for now.
      minPoolSize: 1, 
      maxIdleTimeMS: 60000,
      retryWrites: true,
      retryReads: true
    });
  } catch (error) {
    logger.error('Worker failed to connect to MongoDB on startup', error);
    // Optionally exit if connection is crucial for the worker's basic function
    // process.exit(1); 
  }
};

// Call the connection function at startup
connectToDatabase();

// Ensure public directory exists
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const SCREENSHOTS_DIR = path.join(PUBLIC_DIR, 'screenshots');
const PDFS_DIR = path.join(PUBLIC_DIR, 'pdfs');

// Create directories if they don't exist
try {
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PDFS_DIR)) {
    fs.mkdirSync(PDFS_DIR, { recursive: true });
  }
} catch (error) {
  logger.error('Error creating directories', { error });
}

// Worker initialization
let browser;

// Initialize Puppeteer browser
async function initBrowser() {
  if (browser) return browser;
  
  logger.info('Launching Puppeteer browser...');
  
  // Launch with Apple emoji support
  try {
    browser = await puppeteer.launch({
      headless: process.env.PUPPETEER_HEADLESS !== 'false' ? 'new' : false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-web-security',
        '--font-render-hinting=none' // Improves emoji rendering
      ],
      ignoreHTTPSErrors: true,
      defaultViewport: {
        width: 1280,
        height: 800
      }
    });
    
    browser.on('disconnected', () => {
      logger.warn('Browser disconnected, will restart on next job');
      browser = null;
    });
    
    return browser;
  } catch (error) {
    logger.error(`Error launching browser: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

// Save file to local filesystem
async function saveToFile(buffer, contentType) {
  const id = uuidv4();
  const isPdf = contentType === 'application/pdf';
  const filename = `${id}.${isPdf ? 'pdf' : 'png'}`;
  const filePath = path.join(isPdf ? PDFS_DIR : SCREENSHOTS_DIR, filename);
  
  try {
    await fs.promises.writeFile(filePath, buffer);
    // Return a URL that can be used to access the file
    const relativePath = path.join(isPdf ? 'pdfs' : 'screenshots', filename);
    return `/public/${relativePath.replace(/\\/g, '/')}`;
  } catch (error) {
    logger.error('Error saving file', { error });
    throw error;
  }
}

// Action handlers
const actionHandlers = {
  // Navigate to URL
  async navigate(page, params) {
    await page.goto(params.url, {
      waitUntil: 'networkidle2',
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000
    });
    return { url: page.url() };
  },
  
  // Scrape content
  async scrape(page, params) {
    const { selector, attribute = 'textContent' } = params;
    
    await page.waitForSelector(selector, {
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000
    });
    
    let result;
    if (params.multiple) {
      // Scrape multiple elements
      result = await page.$$eval(selector, (elements, attr) => {
        return elements.map(el => el[attr] || el.getAttribute(attr));
      }, attribute);
    } else {
      // Scrape single element
      result = await page.$eval(selector, (el, attr) => {
        return el[attr] || el.getAttribute(attr);
      }, attribute);
    }
    
    return result;
  },
  
  // Click element
  async click(page, params) {
    const { selector } = params;
    
    await page.waitForSelector(selector, {
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000
    });
    
    await page.click(selector);
    return { clicked: true };
  },
  
  // Type text
  async type(page, params) {
    const { selector, value, delay } = params;
    
    await page.waitForSelector(selector, {
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000
    });
    
    await page.type(selector, value, { delay: delay || 50 });
    return { typed: true };
  },
  
  // Take screenshot
  async screenshot(page, params) {
    const { selector, fullPage = false } = params;
    let buffer;
    
    if (selector) {
      await page.waitForSelector(selector, {
        timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000
      });
      
      const element = await page.$(selector);
      buffer = await element.screenshot();
    } else {
      buffer = await page.screenshot({ 
        fullPage, 
        type: 'png',
        encoding: 'binary'
      });
    }
    
    const url = await saveToFile(buffer, 'image/png');
    return { url };
  },
  
  // Generate PDF
  async pdf(page, params) {
    const buffer = await page.pdf({
      format: params.format || 'A4',
      printBackground: true,
      margin: params.margin || {
        top: '10mm',
        bottom: '10mm',
        left: '10mm',
        right: '10mm'
      }
    });
    
    const url = await saveToFile(buffer, 'application/pdf');
    return { url };
  },
  
  // Wait for element or timeout
  async wait(page, params) {
    const { selector, timeout = 30000 } = params;
    
    if (selector) {
      await page.waitForSelector(selector, { timeout });
      return { waited: true, for: 'selector', selector };
    } else {
      await page.waitForTimeout(timeout);
      return { waited: true, for: 'timeout', timeout };
    }
  },
  
  // Evaluate custom JavaScript
  async evaluate(page, params) {
    const { script } = params;
    const result = await page.evaluate(script);
    return result;
  },
  
  // Scroll to element or position
  async scroll(page, params) {
    const { selector, x, y } = params;
    
    if (selector) {
      await page.waitForSelector(selector, {
        timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000
      });
      
      await page.$eval(selector, el => el.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      }));
      
      return { scrolled: true, to: 'element', selector };
    } else {
      await page.evaluate((xPos, yPos) => {
        window.scrollTo({
          left: xPos,
          top: yPos,
          behavior: 'smooth'
        });
      }, x || 0, y || 0);
      
      return { scrolled: true, to: 'position', x: x || 0, y: y || 0 };
    }
  },
  
  // Select dropdown option
  async select(page, params) {
    const { selector, value } = params;
    
    await page.waitForSelector(selector, {
      timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000
    });
    
    const result = await page.select(selector, value);
    return { selected: true, value };
  }
};

// Process the job
async function processJob(job) {
  let dbJob = null;
  let browser = null;
  let page = null;

  try {
    logger.info(`Processing job ${job.id}`);
    
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
    
    // Initialize browser
    try {
      logger.info('Initializing browser...');
      browser = await initBrowser();
      
      logger.info('Creating new page...');
      page = await browser.newPage();
      
      // Set default timeout
      page.setDefaultTimeout(parseInt(process.env.PUPPETEER_TIMEOUT) || 30000);
      
      // Enable console logging from the page
      page.on('console', msg => {
        logger.debug(`[Browser Console] ${msg.text()}`);
      });
      
      // Process each action
      const actions = job.data.actions;
      const results = {};
      const assets = [];
      
      logger.info(`Processing ${actions.length} actions...`);
      
      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const handler = actionHandlers[action.type];
        
        if (!handler) {
          throw new Error(`Unknown action type: ${action.type}`);
        }
        
        try {
          logger.info(`Executing action ${i+1}: ${action.type}`);
          
          // Update action status
          dbJob.actions[i].startedAt = new Date();
          await dbJob.save();
          
          // Record start time
          const startTime = Date.now();
          
          // Execute the action
          const result = await handler(page, action.params);
          
          // Calculate duration
          const duration = Date.now() - startTime;
          
          // Store result
          results[`action_${i}`] = result;
          
          // Update action in database
          dbJob.actions[i].result = result;
          dbJob.actions[i].duration = duration;
          dbJob.actions[i].completedAt = new Date();
          
          // For screenshot and PDF actions, record asset URLs
          if (action.type === 'screenshot' || action.type === 'pdf') {
            assets.push({
              type: action.type,
              url: result.url,
              createdAt: new Date()
            });
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
      
      // Close the page when done
      if (page) await page.close();
      
      // Update job in database
      dbJob.status = 'completed';
      dbJob.results = results;
      dbJob.assets = assets;
      dbJob.completedAt = new Date();
      dbJob.progress = 100;
      await dbJob.save();
      
      logger.info(`Job ${job.id} completed successfully`);
      return { success: true, results, assets };
      
    } catch (actionError) {
      if (page) await page.close();
      throw actionError;
    }
    
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

// Clean up on exit
async function cleanUp() {
  if (browser) {
    logger.info('Closing browser...');
    await browser.close();
  }
  
  // Give pending operations a chance to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  process.exit(0);
}

process.on('SIGTERM', cleanUp);
process.on('SIGINT', cleanUp);

// Process jobs with concurrency
puppeteerQueue.process(
  parseInt(process.env.JOB_CONCURRENCY) || 2, // Lower concurrency to reduce DB load
  processJob
);

logger.info('Puppeteer worker started');

module.exports = { processJob };