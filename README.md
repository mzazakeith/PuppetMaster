# PuppetMaster 🤖

A powerful Puppeteer-based microservice for web automation and scraping with Bull queue system.

## Features

- 🌐 Headless browser automation with Puppeteer and Chromium
- 🔄 Bull queue system for job management
- 📊 MongoDB for job storage and history
- 📷 Local file storage for screenshots and PDFs
- 📱 Apple emoji support
- 🔍 Simple, well-defined actions API
- 📈 Job history, status checking, and metrics

## Installation

### Prerequisites

- Node.js 16+
- MongoDB
- Redis (for Bull queue)

### Setup

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file with the following configuration:

```
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/puppet-master
REDIS_HOST=localhost
REDIS_PORT=6379
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=30000
JOB_CONCURRENCY=5
JOB_ATTEMPTS=3
JOB_TIMEOUT=300000
```

4. Start the server:

```bash
# Development
npm run dev

# Production
npm start
```

5. Start a worker (in a separate terminal):

```bash
node src/workers/puppeteer.worker.js
```

## API Documentation

### Job Management

#### Create a new job

```
POST /api/jobs
```

Request body:

```json
{
  "name": "Example Job",
  "description": "Scrape website title",
  "actions": [
    {
      "type": "navigate",
      "params": {
        "url": "https://example.com"
      }
    },
    {
      "type": "scrape",
      "params": {
        "selector": "h1",
        "attribute": "textContent"
      }
    },
    {
      "type": "screenshot",
      "params": {
        "fullPage": true
      }
    }
  ]
}
```

#### Get all jobs

```
GET /api/jobs?status=completed&page=1&limit=10
```

#### Get job by ID

```
GET /api/jobs/:id
```

#### Get job assets

```
GET /api/jobs/:id/assets
```

#### Cancel a job

```
POST /api/jobs/:id/cancel
```

#### Retry a failed job

```
POST /api/jobs/:id/retry
```

#### Delete a job

```
DELETE /api/jobs/:id
```

### Queue Management

#### Get queue metrics

```
GET /api/queue/metrics
```

#### Get queue jobs

```
GET /api/queue/jobs?types=active,waiting,failed&limit=10
```

#### Clear queue (admin only)

```
DELETE /api/queue/clear
```

#### Get worker status

```
GET /api/queue/status
```

## Action Types

| Action | Description | Parameters |
|--------|-------------|------------|
| `navigate` | Go to a URL | `url` (string) |
| `scrape` | Extract content from element | `selector` (string), `attribute` (string, optional), `multiple` (boolean, optional) |
| `click` | Click an element | `selector` (string) |
| `type` | Type text into input | `selector` (string), `value` (string), `delay` (number, optional) |
| `screenshot` | Take a screenshot | `selector` (string, optional), `fullPage` (boolean, optional) |
| `pdf` | Generate PDF | `format` (string, optional), `margin` (object, optional) |
| `wait` | Wait for element or timeout | `selector` (string, optional), `timeout` (number, optional) |
| `evaluate` | Run custom JavaScript | `script` (string) |
| `scroll` | Scroll to element or position | `selector` (string, optional), `x` (number, optional), `y` (number, optional) |
| `select` | Select dropdown option | `selector` (string), `value` (string) |

## Example Job

Here's an example job that logs into a website and takes a screenshot:

```json
{
  "name": "Login to Website",
  "description": "Log in and take a screenshot of dashboard",
  "actions": [
    {
      "type": "navigate",
      "params": {
        "url": "https://example.com/login"
      }
    },
    {
      "type": "type",
      "params": {
        "selector": "input#username",
        "value": "testuser"
      }
    },
    {
      "type": "type",
      "params": {
        "selector": "input#password",
        "value": "password123"
      }
    },
    {
      "type": "click",
      "params": {
        "selector": "button[type=submit]"
      }
    },
    {
      "type": "wait",
      "params": {
        "selector": ".dashboard-loaded"
      }
    },
    {
      "type": "screenshot",
      "params": {
        "fullPage": true
      }
    }
  ]
}
```

## License

MIT

## Author

Your Name 