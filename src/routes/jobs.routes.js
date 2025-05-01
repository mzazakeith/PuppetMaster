const express = require('express');
const { StatusCodes } = require('http-status-codes');
const Joi = require('joi');

const logger = require('../utils/logger');
const Job = require('../models/Job');
const { addJob, getJob, removeJob } = require('../services/queue');
const { ApiError } = require('../middleware/errorHandler');
const { validateRequest } = require('../middleware/validation');

const router = express.Router();

// Validation schemas
const actionSchema = Joi.object({
  type: Joi.string().required().valid(
    // Puppeteer actions
    'navigate', 'scrape', 'click', 'type', 'screenshot', 
    'pdf', 'wait', 'evaluate', 'scroll', 'select',
    // Crawl4AI actions
    'crawl', 'extract', 'generateSchema', 'verify', 'crawlLinks',
    'filter', 'extractPDF'
  ),
  params: Joi.object().required()
});

const createJobSchema = {
  body: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().optional(),
    priority: Joi.number().min(-100).max(100).default(0),
    actions: Joi.array().items(actionSchema).min(1).required(),
    metadata: Joi.object().optional()
  })
};

// Create job
router.post('/', validateRequest(createJobSchema), async (req, res, next) => {
  try {
    const { name, description, priority, actions, metadata } = req.body;
    
    // Create job in database
    const job = new Job({
      name,
      description,
      priority,
      actions: actions.map(action => ({
        type: action.type,
        params: action.params
      })),
      metadata
    });
    
    await job.save();
    
    // Add job to queue
    await addJob({
      jobId: job.jobId,
      name,
      actions
    }, { priority });
    
    res.status(StatusCodes.CREATED).json({
      status: 'success',
      message: 'Job created successfully',
      data: {
        jobId: job.jobId,
        name: job.name,
        status: job.status
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get all jobs with filters
router.get('/', async (req, res, next) => {
  try {
    const { 
      status, 
      page = 1, 
      limit = 10, 
      sort = 'createdAt', 
      order = 'desc' 
    } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = order === 'desc' ? -1 : 1;
    
    const jobs = await Job.find(query)
      .sort({ [sort]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v');
    
    const totalJobs = await Job.countDocuments(query);
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      data: {
        jobs,
        pagination: {
          total: totalJobs,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalJobs / parseInt(limit))
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get job by ID
router.get('/:id', async (req, res, next) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id }).select('-__v');
    
    if (!job) {
      throw ApiError.notFound(`Job with ID ${req.params.id} not found`);
    }
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      data: { job }
    });
  } catch (error) {
    next(error);
  }
});

// Get job assets
router.get('/:id/assets', async (req, res, next) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id }).select('assets');
    
    if (!job) {
      throw ApiError.notFound(`Job with ID ${req.params.id} not found`);
    }
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      data: { assets: job.assets || [] }
    });
  } catch (error) {
    next(error);
  }
});

// Cancel a job
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id });
    
    if (!job) {
      throw ApiError.notFound(`Job with ID ${req.params.id} not found`);
    }
    
    if (job.status === 'completed' || job.status === 'failed') {
      throw ApiError.badRequest(`Job with ID ${req.params.id} is already ${job.status}`);
    }
    
    // Remove from queue if pending
    if (job.status === 'pending') {
      await removeJob(req.params.id);
    }
    
    // Update status
    job.status = 'cancelled';
    job.completedAt = new Date();
    await job.save();
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      message: 'Job cancelled successfully',
      data: { jobId: job.jobId }
    });
  } catch (error) {
    next(error);
  }
});

// Delete a job
router.delete('/:id', async (req, res, next) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id });
    
    if (!job) {
      throw ApiError.notFound(`Job with ID ${req.params.id} not found`);
    }
    
    // Remove from queue if pending
    if (job.status === 'pending') {
      await removeJob(req.params.id);
    }
    
    // Delete from database
    await job.deleteOne();
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      message: 'Job deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// Retry a failed job
router.post('/:id/retry', async (req, res, next) => {
  try {
    const job = await Job.findOne({ jobId: req.params.id });
    
    if (!job) {
      throw ApiError.notFound(`Job with ID ${req.params.id} not found`);
    }
    
    if (job.status !== 'failed') {
      throw ApiError.badRequest(`Only failed jobs can be retried. Current status: ${job.status}`);
    }
    
    // Reset job status
    job.status = 'pending';
    job.error = null;
    job.startedAt = null;
    job.completedAt = null;
    job.progress = 0;
    
    // Reset action statuses
    job.actions.forEach(action => {
      action.result = undefined;
      action.error = undefined;
      action.startedAt = undefined;
      action.completedAt = undefined;
      action.duration = undefined;
    });
    
    await job.save();
    
    // Add back to queue
    await addJob({
      jobId: job.jobId,
      name: job.name,
      actions: job.actions.map(a => ({
        type: a.type,
        params: a.params
      }))
    }, { priority: job.priority });
    
    res.status(StatusCodes.OK).json({
      status: 'success',
      message: 'Job retried successfully',
      data: { jobId: job.jobId }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router; 