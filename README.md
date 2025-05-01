# PuppetMaster 🤖

A powerful microservice for web automation, scraping, and data processing, integrating Puppeteer for browser control and Crawl4AI for advanced crawling and AI-powered extraction.

## Features

- **Puppeteer Core:**
  - 🌐 Headless browser automation with Puppeteer and Chromium
  - 🖱️ Standard browser interactions: navigate, click, type, scroll, select
  - 🖼️ Screenshot generation (full page or element)
  - 📄 PDF generation
  - ⚙️ Custom JavaScript evaluation
- **Crawl4AI Integration:**
  - 🕷️ Advanced crawling strategies (schema-based, LLM-driven)
  - 🧩 Flexible data extraction (CSS, XPath, LLM)
  - 🧠 Dynamic schema generation using LLMs
  - ✅ Content verification
  - 🔗 Deep link crawling
  - ⏳ Element waiting and filtering
  - 📄 PDF text extraction
  - 📝 Webpage to Markdown conversion
  - 🌐 Webpage to PDF conversion (via Crawl4AI)
- **System:**
  - 🔄 Bull queue system for robust job management (separate queues for Puppeteer & Crawl4AI)
  - 📊 MongoDB for job persistence, status tracking, and results storage
  - 💾 Local file storage for generated assets (screenshots, PDFs, Markdown files)
  - 📈 API endpoints for job management and queue monitoring

## Installation

### Prerequisites

- Node.js (v18 or later recommended)
- npm or yarn
- Python (v3.8 or later recommended)
- pip
- MongoDB (local instance or Atlas)
- Redis (local instance or cloud provider)

### Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd PuppetMaster
    ```

2.  **Install Node.js dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```

3.  **Set up Python environment for Crawl4AI:**
    ```bash
    # Create a virtual environment (recommended)
    python3 -m venv .venv
    source .venv/bin/activate  # On Windows use `.venv\\Scripts\\activate`

    # Install Python dependencies
    pip install -r requirements.txt
    ```

4.  **Configure Environment Variables:**
    Create a `.env` file in the project root and configure the following variables:

    ```dotenv
    # Node.js App Configuration
    PORT=3000
    NODE_ENV=development # or production
    MONGODB_URI=mongodb://localhost:27017/puppet-master # Replace with your MongoDB connection string
    REDIS_HOST=localhost
    REDIS_PORT=6379
    RATE_LIMIT_WINDOW_MS=60000
    RATE_LIMIT_MAX=100

    # Puppeteer Worker Configuration
    PUPPETEER_HEADLESS=true # Set to false to run browser in non-headless mode
    PUPPETEER_TIMEOUT=60000 # Default timeout for Puppeteer operations (ms)
    JOB_CONCURRENCY=2 # Max concurrent Puppeteer jobs

    # Crawl4AI Worker & Service Configuration
    CRAWL4AI_API_URL=http://localhost:8000 # URL of the Python Crawl4AI service
    CRAWL4AI_API_TIMEOUT=120000 # Timeout for requests to Crawl4AI service (ms)
    CRAWL4AI_PORT=8000 # Port for the Python Crawl4AI service
    JOB_ATTEMPTS=3 # Default Bull queue job attempts
    JOB_TIMEOUT=300000 # Default Bull queue job timeout (ms)
    # Add any necessary API keys for LLM providers (e.g., OPENAI_API_KEY) if using LLMExtractionStrategy
    # OPENAI_API_KEY=your_openai_api_key
    ```

5.  **Start the Services and Workers:**

    You can start everything concurrently using the provided npm scripts:

    ```bash
    # For development (with nodemon for Node.js app/worker)
    npm run dev:all

    # For production
    npm run start:all
    ```

    These scripts run the following components:
    *   Node.js API Server (`src/index.js`)
    *   Puppeteer Worker (`src/workers/puppeteer.worker.js`) - Started via `test-worker.js` in the script, **consider renaming `test-worker.js` to `src/workers/puppeteer.worker.js` and updating `package.json` if that's the intended main worker.**
    *   Crawl4AI Python Service (`src/crawl4ai/main.py`) - Started via `./start-crawl4ai.sh`

    Alternatively, you can start components individually:

    ```bash
    # Start Node.js API (Terminal 1)
    npm start  # or npm run dev

    # Start Puppeteer Worker (Terminal 2)
    # Make sure the worker file path is correct in package.json start:worker/dev:worker script
    npm run start:worker # or npm run dev:worker

    # Start Crawl4AI Service (Terminal 3)
    npm run start:crawl4ai
    # or directly: ./start-crawl4ai.sh
    # or: source .venv/bin/activate && python src/crawl4ai/main.py
    ```

## API Documentation

The API allows you to create, manage, and monitor automation jobs.

### Base URL: `/api`

### Job Management (`/jobs`)

#### `POST /jobs`

Create a new job. The job will be routed to the appropriate queue (Puppeteer or Crawl4AI) based on its actions.

**Request Body:**

```json
{
  "name": "Unique Job Name",
  "description": "Optional job description",
  "priority": 0, // Optional: Bull queue priority (-100 to 100)
  "actions": [
    {
      "type": "action_type_1", // See Action Types section below
      "params": { ... } // Parameters specific to the action type
    },
    {
      "type": "action_type_2",
      "params": { ... }
    }
    // ... more actions
  ],
  "metadata": { ... } // Optional: Any additional data to store with the job
}
```

**Response (Success: 201 Created):**

```json
{
  "status": "success",
  "message": "Job created successfully",
  "data": {
    "jobId": "unique-job-id",
    "name": "Unique Job Name",
    "status": "pending"
  }
}
```

#### `GET /jobs`

Get a list of jobs with filtering and pagination.

**Query Parameters:**

*   `status` (string, optional): Filter by job status (e.g., `pending`, `processing`, `completed`, `failed`, `cancelled`).
*   `page` (number, optional, default: 1): Page number for pagination.
*   `limit` (number, optional, default: 10): Number of jobs per page.
*   `sort` (string, optional, default: `createdAt`): Field to sort by.
*   `order` (string, optional, default: `desc`): Sort order (`asc` or `desc`).

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "data": {
    "jobs": [ ... ], // Array of job objects
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 10,
      "pages": 10
    }
  }
}
```

#### `GET /jobs/:id`

Get details of a specific job by its `jobId`.

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "data": {
    "job": { ... } // Full job object
  }
}
```

#### `GET /jobs/:id/assets`

Get assets generated by a specific job (e.g., screenshot URLs, PDF URLs).

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "data": {
    "assets": [
      { "type": "screenshot", "url": "/public/screenshots/...", "createdAt": "..." },
      { "type": "pdf", "url": "/public/pdfs/...", "createdAt": "..." }
      // ... other assets like markdown URLs
    ]
  }
}
```

#### `POST /jobs/:id/cancel`

Cancel a pending or processing job.

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "message": "Job cancelled successfully",
  "data": { "jobId": "unique-job-id" }
}
```

#### `POST /jobs/:id/retry`

Retry a job that has failed. Resets status to `pending` and adds it back to the queue.

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "message": "Job retried successfully",
  "data": { "jobId": "unique-job-id" }
}
```

#### `DELETE /jobs/:id`

Delete a job from the database and remove it from the queue if pending.

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "message": "Job deleted successfully"
}
```

### Queue Management (`/queue`)

#### `GET /queue/metrics`

Get statistics about both the Puppeteer and Crawl4AI job queues.

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "data": {
    "metrics": {
      "puppeteer": { "waiting": 0, "active": 1, "completed": 50, "failed": 2, "delayed": 0, "total": 53 },
      "crawl4ai": { "waiting": 2, "active": 0, "completed": 25, "failed": 1, "delayed": 0, "total": 28 },
      "total": { "waiting": 2, "active": 1, "completed": 75, "failed": 3, "delayed": 0, "total": 81 }
    }
  }
}
```

#### `GET /queue/jobs`

Get jobs currently in the queues based on their state.

**Query Parameters:**

*   `types` (string, optional, default: `active,waiting,delayed,failed,completed`): Comma-separated list of job states to retrieve.
*   `limit` (number, optional, default: 10): Maximum number of jobs to return across all specified types.

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "data": {
    "jobs": [
      {
        "id": "bull-job-id", // Bull queue job ID
        "name": "Job Name",
        "jobId": "unique-db-job-id", // Database job ID
        "timestamp": 1678886400000,
        // ... other Bull job details
        "state": "active" // or waiting, completed, etc.
      }
      // ... more jobs
    ]
  }
}
```

#### `DELETE /queue/clear`

**(Admin/Protected Endpoint)** Clears all jobs from all queues (waiting, active, delayed, failed, completed). Use with caution!

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "message": "Queue cleared successfully"
}
```

#### `GET /queue/status`

Provides a simple status check for the Node.js API process (not individual workers).

**Response (Success: 200 OK):**

```json
{
  "status": "success",
  "data": {
    "isRunning": true,
    "uptime": 12345.67,
    "memory": { ... }, // Node.js process memory usage
    "cpuUsage": { ... } // Node.js process CPU usage
  }
}
```

## Action Types

Jobs consist of a sequence of actions. Each action has a `type` and `params`.

### Puppeteer Actions (Handled by `puppeteer.worker.js`)

| Action Type  | Description                      | Parameters (`params`)                                                                                                |
| :----------- | :------------------------------- | :------------------------------------------------------------------------------------------------------------------- |
| `navigate`   | Go to a URL                      | `url` (string, required)                                                                                             |
| `scrape`     | Extract content from element(s)  | `selector` (string, required), `attribute` (string, optional, default: `textContent`), `multiple` (boolean, optional) |
| `click`      | Click an element                 | `selector` (string, required)                                                                                        |
| `type`       | Type text into an input          | `selector` (string, required), `value` (string, required), `delay` (number, optional, ms)                             |
| `screenshot` | Take a screenshot                | `selector` (string, optional), `fullPage` (boolean, optional, default: false)                                        |
| `pdf`        | Generate PDF of the current page | `format` (string, optional, e.g., `A4`), `margin` (object, optional, e.g., `{top: '10mm', ...}`), `printBackground` (boolean, optional) |
| `wait`       | Wait for element or timeout      | `selector` (string, optional), `timeout` (number, optional, ms, default: 30000)                                       |
| `evaluate`   | Run custom JavaScript on page    | `script` (string, required) - *Must be a self-contained function body or expression*                                 |
| `scroll`     | Scroll page or element           | `selector` (string, optional - scrolls element into view), `x` (number, optional - scrolls window), `y` (number, optional - scrolls window) |
| `select`     | Select an option in a dropdown   | `selector` (string, required), `value` (string, required)                                                            |

### Crawl4AI Actions (Handled by `crawl4ai.worker.js` via Python Service)

*Note: These actions are forwarded to the Crawl4AI Python microservice.*

| Action Type      | Description                                                | Parameters (`params`)                                                                                                                                |
| :--------------- | :--------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| `crawl`          | Crawl & extract using schema/strategy                    | `url` (string, required), `schema` (object, optional), `strategy` (string, optional, e.g., `JsonCssExtractionStrategy`), `baseSelector` (string, optional) |
| `extract`        | Extract specific content (text, html, attribute)           | `url` (string, required), `selector` (string, required), `type` (string, optional, default: `text`), `attribute` (string, optional)                     |
| `generateSchema` | Generate extraction schema using LLM                     | `url` (string, required), `prompt` (string, required), `model` (string, optional)                                                                    |
| `verify`         | Verify element existence or content                        | `url` (string, required), `selector` (string, required), `expected` (string, optional)                                                               |
| `crawlLinks`     | Follow links and extract data                              | `url` (string, required), `link_selector` (string, required), `schema` (object, optional), `max_depth` (number, optional, default: 1)               |
| `wait` (Crawl4AI)| Wait for an element (delegated to Crawl4AI service)      | `url` (string, required), `selector` (string, required), `timeout` (number, optional, ms, default: 30000)                                            |
| `filter`         | Filter elements based on condition                         | `url` (string, required), `selector` (string, required), `condition` (string, required, e.g., `href.includes("example.com")`, `text.includes("Price")`) |
| `screenshot` (Crawl4AI) | Take screenshot (delegated to Crawl4AI service)    | `url` (string, required), `selector` (string, optional), `full_page` (boolean, optional, default: false)                                            |
| `extractPDF`     | Extract text content from a PDF URL                        | `url` (string, required)                                                                                                                             |
| `toMarkdown`     | Convert webpage content to Markdown                        | `url` (string, required), `options` (object, optional - see Crawl4AI docs)                                                                           |
| `toPDF` (Crawl4AI)| Convert webpage to PDF (delegated to Crawl4AI service)   | `url` (string, required)                                                                                                                             |

## Example Jobs

### Simple Puppeteer Job

```json
{
  "name": "Get Example.com Title and Screenshot",
  "actions": [
    { "type": "navigate", "params": { "url": "https://example.com" } },
    { "type": "scrape", "params": { "selector": "h1" } },
    { "type": "screenshot", "params": { "fullPage": true } }
  ]
}
```

### Crawl4AI Job (Schema Extraction)

```json
{
  "name": "Extract Hacker News Stories",
  "actions": [
    {
      "type": "crawl",
      "params": {
        "url": "https://news.ycombinator.com",
        "schema": {
          "name": "HackerNewsStory",
          "baseSelector": "tr.athing",
          "fields": [
            { "name": "title", "selector": "span.titleline", "type": "text" },
            { "name": "link", "selector": "span.titleline > a", "type": "attribute", "attribute": "href" },
            { "name": "rank", "selector": "span.rank", "type": "text" }
          ]
        },
        "strategy": "JsonCssExtractionStrategy"
      }
    }
  ]
}
```

### Mixed Job (Puppeteer Navigation + Crawl4AI PDF Extraction)

```json
{
  "name": "Navigate and Extract PDF",
  "actions": [
    { "type": "navigate", "params": { "url": "https://www.example.com/some-page-with-pdf-link" } },
    { "type": "scrape", "params": { "selector": "a.pdf-link", "attribute": "href" } },
    { "type": "extractPDF", "params": { "url": "{{action_1.result}}" } } // Placeholder for dynamic URL from previous step (Needs worker logic update for templating)
  ]
}
```

*Note: Dynamic parameter passing between steps (like in the Mixed Job example) might require enhancements in the worker logic to handle templating or context passing.*

## Testing

Several test scripts are included to verify functionality:

*   `test-puppeteer.js`: Runs a simple Puppeteer navigation and screenshot task directly.
*   `test-crawl4ai.js`: Makes direct API calls to the Crawl4AI microservice endpoints. Requires the service to be running.
*   `test-worker.js`: Simulates processing a specific Puppeteer job locally, useful for debugging worker actions.

Run them using Node.js:

```bash
node test-puppeteer.js
node test-crawl4ai.js # Ensure Crawl4AI service is running
node test-worker.js
```

## License

MIT

## Author

Keith Mzaza