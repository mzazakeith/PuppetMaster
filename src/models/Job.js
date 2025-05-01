const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const actionSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: [
      // Puppeteer actions
      'navigate', 'scrape', 'click', 'type', 'screenshot', 'pdf', 
      'wait', 'evaluate', 'scroll', 'select',
      // Crawl4AI actions
      'crawl', 'extract', 'generateSchema', 'verify', 'crawlLinks',
      'filter', 'extractPDF'
    ]
  },
  params: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  result: mongoose.Schema.Types.Mixed,
  error: {
    message: String,
    stack: String,
    code: String
  },
  duration: Number, // in milliseconds
  startedAt: Date,
  completedAt: Date
}, { _id: false });

const jobSchema = new mongoose.Schema({
  jobId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: Number,
    default: 0
  },
  actions: [actionSchema],
  results: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  assets: [{
    type: {
      type: String,
      enum: ['screenshot', 'pdf']
    },
    url: String,
    createdAt: Date
  }],
  error: {
    message: String,
    stack: String,
    code: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  attempts: {
    type: Number,
    default: 0
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  startedAt: Date,
  completedAt: Date,
  createdBy: String,
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: { 
    createdAt: true, 
    updatedAt: 'updatedAt'
  }
});

// Indexes for faster querying
jobSchema.index({ status: 1, createdAt: -1 });
jobSchema.index({ createdBy: 1, createdAt: -1 });

// Virtual for job duration
jobSchema.virtual('duration').get(function() {
  if (this.startedAt && this.completedAt) {
    return this.completedAt - this.startedAt;
  }
  return null;
});

// Method to calculate progress based on actions
jobSchema.methods.calculateProgress = function() {
  if (!this.actions.length) return 0;
  
  const completedActions = this.actions.filter(
    action => action.completedAt !== undefined
  ).length;
  
  return Math.floor((completedActions / this.actions.length) * 100);
};

const Job = mongoose.model('Job', jobSchema);

module.exports = Job; 