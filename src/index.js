require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { StatusCodes } = require('http-status-codes');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const logger = require('./utils/logger');
const apiRoutes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Apply middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));

// Serve static files from the public directory
app.use('/public', express.static(path.join(process.cwd(), 'public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  message: {
    status: StatusCodes.TOO_MANY_REQUESTS,
    message: 'Too many requests, please try again later.'
  }
});
app.use(limiter);

// Health check route
app.get('/health', (req, res) => {
  res.status(StatusCodes.OK).json({
    status: 'ok',
    timestamp: new Date(),
    service: 'puppet-master'
  });
});

// API routes
app.use('/api', apiRoutes);

// Error handling
app.use(errorHandler);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/puppet-master', {
  serverSelectionTimeoutMS: 30000,   // Increase from default 30s to 30s (explicitly set)
  socketTimeoutMS: 45000,            // Increase socket timeout
  connectTimeoutMS: 30000,           // Connection timeout
  maxPoolSize: 10,                   // Connection pool size
  minPoolSize: 2,                    // Minimum connections maintained
  maxIdleTimeMS: 60000,              // How long a connection can remain idle before being removed
  retryWrites: true,
  retryReads: true
})
  .then(() => {
    logger.info('Connected to MongoDB');
    
    // Start the server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error('Failed to connect to MongoDB', error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

module.exports = app; 