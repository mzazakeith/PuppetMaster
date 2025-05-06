# PuppetMaster 🤖

A powerful microservice for web automation, scraping, and data processing, integrating Puppeteer for browser control and Crawl4AI for advanced crawling and AI-powered extraction.

[<img src="https://devin.ai/assets/askdeepwiki.png" alt="Ask https://DeepWiki.com" height="20"/>](https://deepwiki.com/mzazakeith/PuppetMaster)

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

## Key Technologies

*   **Backend:** Node.js, Express.js
*   **Web Automation:** Puppeteer
*   **Crawling & AI:** Python, FastAPI, Crawl4AI
*   **Job Queue:** BullMQ, Redis
*   **Database:** MongoDB (with Mongoose)
*   **Language:** JavaScript, Python

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
    # Add necessary API keys for LLM providers if using LLMExtractionStrategy
    # Example for OpenAI (only required if using OpenAI models):
    # OPENAI_API_KEY=your_openai_api_key

    # Example for Google Gemini (only required if using Gemini models):
    # GOOGLE_API_KEY=your_google_ai_api_key
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
    *   Node.js API Server (`src/index.js`) - Also processes jobs from the `crawl4ai-jobs` queue.
    *   Puppeteer Worker (`src/workers/puppeteer.worker.js`) - Processes jobs from the `puppeteer-jobs` queue.
    *   Crawl4AI Python Service (`src/crawl4ai/main.py`) - Handles Crawl4AI API requests from the Node.js worker.

    Alternatively, you can start components individually:

    ```bash
    # Start Node.js API (Terminal 1)
    # This process also handles processing for Crawl4AI jobs.
    npm start  # or npm run dev

    # Start Puppeteer Worker (Terminal 2)
    # Processes only Puppeteer-specific jobs.
    npm run start:worker # or npm run dev:worker

    # Start Crawl4AI Python Service (Terminal 3)
    npm run start:crawl4ai
    # or directly: ./start-crawl4ai.sh
    # or: source .venv/bin/activate && python src/crawl4ai/main.py
    ```

## Architecture Overview

PuppetMaster uses a microservice architecture:

*   **Node.js API Server (`src/index.js`):** 
    *   Exposes REST API endpoints for job management and queue monitoring.
    *   Uses Express.js, Mongoose (for MongoDB interaction), and Bull for queue management.
    *   Handles incoming job requests, saving them to MongoDB.
    *   Adds jobs to either the Puppeteer or Crawl4AI Bull queue based on action types.
    *   Processes jobs from the `crawl4ai-jobs` queue by interacting with the Crawl4AI Python Service.
*   **Puppeteer Worker (`src/workers/puppeteer.worker.js`):**
    *   A separate Node.js process that listens to the `puppeteer-jobs` Bull queue.
    *   Executes Puppeteer-specific browser automation tasks (navigate, click, screenshot, etc.).
    *   Updates job status and results in MongoDB.
*   **Crawl4AI Python Service (`src/crawl4ai/`):**
    *   A FastAPI application providing endpoints for advanced crawling and extraction tasks.
    *   Uses the `Crawl4AI` library internally.
    *   Communicates with the Node.js API/worker process via HTTP requests.
*   **Bull Queues (Redis):** Manages job processing, ensuring robustness and retries.
*   **MongoDB:** Persists job definitions, status, results, and generated asset metadata.
*   **Local File Storage (`/public`):** Stores generated files like screenshots, PDFs, and Markdown files.

*   **Error Handling:** Uses a centralized error handler (`src/middleware/errorHandler.js`) providing consistent JSON error responses (see `ApiError` class).
*   **Validation:** Incoming requests for specific endpoints (like job creation) are validated using Joi schemas (`src/middleware/validation.js`).
*   **Job Model:** Job details, including status, results, assets, and progress, are stored in MongoDB using the schema defined in `src/models/Job.js`.

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
| `scrape`     | Extract content from element(s)  | `selector` (string, required), `attribute` (string, optional, default: `textContent`), `multiple` (boolean, optional) | `multiple: true` scrapes all matching elements into an array.                                                           |
| `click`      | Click an element                 | `selector` (string, required)                                                                                        |
| `type`       | Type text into an input          | `selector` (string, required), `value` (string, required), `delay` (number, optional, ms)                             |
| `screenshot` | Take a screenshot                | `selector` (string, optional), `fullPage` (boolean, optional, default: false)                                        | Saves to `/public/screenshots` and returns the URL.                                                                 |
| `pdf`        | Generate PDF of the current page | `format` (string, optional, e.g., `A4`), `margin` (object, optional, e.g., `{top: '10mm', ...}`), `printBackground` (boolean, optional) | Saves to `/public/pdfs` and returns the URL.                                                                        |
| `wait`       | Wait for element or timeout      | `selector` (string, optional), `timeout` (number, optional, ms, default: 30000)                                       | Waits for the element to appear or the specified timeout.                                                           |
| `evaluate`   | Run custom JavaScript on page    | `script` (string, required) - *Must be a self-contained function body or expression*                                 | Returns the result of the script evaluation.                                                                        |
| `scroll`     | Scroll page or element           | `selector` (string, optional - scrolls element into view), `x` (number, optional - scrolls window), `y` (number, optional - scrolls window) | Scrolls window or brings element into view.                                                                         |
| `select`     | Select an option in a dropdown   | `selector` (string, required), `value` (string, required)                                                            |

### Crawl4AI Actions (Handled by `crawl4ai.worker.js` via Python Service)

*Note: These actions are forwarded to the Crawl4AI Python microservice. Jobs containing any of these actions will be processed by the `crawl4ai-jobs` queue and `crawl4ai.worker.js`.*

| Action Type      | Description                                                | Parameters (`params`)                                                                                                                                                                                                                                                                                                                      | Notes                                                                                                                                            |
| :--------------- | :--------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `crawl`          | Crawl & extract using schema/strategy                    | `url` (string, required), `schema` (object, optional), `strategy` (string, optional, e.g., `JsonCssExtractionStrategy`, `LLMExtractionStrategy`), `baseSelector` (string, optional), **For LLM:** `llm_provider` (string, e.g., `openai/gpt-4o-mini`, `gemini/gemini-1.5-pro-latest`), `llm_api_key_env_var` (string, e.g., `OPENAI_API_KEY`, `GOOGLE_API_KEY`), `llm_instruction` (string), `llm_extraction_type` (string, `schema` or `block`), `llm_extra_args` (object, optional) | For `LLMExtractionStrategy`, ensure the corresponding API key (`OPENAI_API_KEY` or `GOOGLE_API_KEY`) is set in the `.env` file if the provider requires it. |
| `extract`        | Extract specific content (text, html, attribute)           | `url` (string, required), `selector` (string, required), `type` (string, optional, default: `text`), `attribute` (string, optional)                                                                                                                                                                                                         | Uses Playwright directly in the Python service for extraction.                                                                                   |
| `generateSchema` | Generate extraction schema using LLM                     | `url` (string, required), `prompt` (string, required), `model` (string, optional, e.g., `openai/gpt-4o-mini`, `gemini/gemini-1.5-pro-latest`)                                                                                                                                                                                                    | Requires appropriate API key in `.env` if the provider requires it.                                                                              |
| `verify`         | Verify element existence or content                        | `url` (string, required), `selector` (string, required), `expected` (string, optional)                                                                                                                                                                                                                                                     | Uses Playwright directly in the Python service.                                                                                                  |
| `crawlLinks`     | Follow links and extract data                              | `url` (string, required), `link_selector` (string, required), `schema` (object, optional), `max_depth` (number, optional, default: 1)                                                                                                                                                                                                         |                                                                                                                                                  |
| `wait` (Crawl4AI)| Wait for an element (delegated to Crawl4AI service)      | `url` (string, required), `selector` (string, required), `timeout` (number, optional, ms, default: 30000)                                                                                                                                                                                                                                 | Uses Playwright directly in the Python service.                                                                                                  |
| `filter`         | Filter elements based on condition                         | `url` (string, required), `selector` (string, required), `condition` (string, e.g., `href.includes("pdf")`, `text.includes("Report")`)                                                                                                                                                                                                   | Uses Playwright directly in the Python service.                                                                                                  |
| `extractPDF`     | Extract text content from a PDF URL                        | `url` (string, required)                                                                                                                                                                                                                                                                                                                   | Fetches and parses PDF content.                                                                                                                  |
| `toMarkdown`     | Convert webpage content to Markdown                        | `url` (string, required), `options` (object, optional, see Crawl4AI docs)                                                                                                                                                                                                                                                                  | Saves to `/public/markdown` and returns the URL/path.                                                                                            |
| `toPDF`          | Convert webpage to PDF (via Crawl4AI)                      | `url` (string, required)                                                                                                                                                                                                                                                                                                                   | Saves to `/public/pdfs` and returns the URL/path.                                                                                                |

## Job Action Execution Flow

PuppetMaster processes jobs containing multiple actions sequentially within a single worker process (either `puppeteer.worker.js` or `crawl4ai.worker.js` based on the action types).

- **Sequential Execution:** Actions defined in the `actions` array of a job are executed one after another in the order they are listed.
- **State Management:**
    - The Puppeteer worker maintains a single browser page instance across actions within a job (e.g., navigating first, then clicking, then scraping).
    - The Crawl4AI worker typically sends each action as a separate request to the Python service, which is stateless between requests for different actions within the same job.
- **Result Passing:** **Currently, the result of one action is *not* automatically passed as input to the `params` of the next action.** The parameters for each action are fixed when the job is initially created.
    - **Workaround:** For complex workflows requiring intermediate results, you need to:
        1.  Create a job for the first action(s).
        2.  Wait for the job to complete and retrieve its result (e.g., a scraped URL) from the API (`GET /jobs/:id`).
        3.  Create a *new* job for the subsequent action(s), using the retrieved result in its `params`.
    - **Future Enhancement:** A potential future enhancement could involve allowing template variables in action parameters (e.g., `"url": "{{results.action_0.url}}"`), which the worker would resolve before executing the action.

### Example: Simple Job (Single Worker)

```json
{
  "name": "Login and Scrape Dashboard",
  "actions": [
    { "type": "navigate", "params": { "url": "https://example.com/login" } },
    { "type": "type", "params": { "selector": "#username", "value": "user" } },
    { "type": "type", "params": { "selector": "#password", "value": "pass" } },
    { "type": "click", "params": { "selector": "button[type='submit']" } },
    { "type": "wait", "params": { "selector": "#dashboard-title" } }, // Wait for dashboard
    { "type": "scrape", "params": { "selector": ".widget-data", "multiple": true } }
  ]
}
```
This entire job would be handled by the `puppeteer.worker.js`.

### Example: Mixed Job (Requires Manual Chaining)

```json
// --- JOB 1 ---
{
  "name": "Navigate and Get PDF Link",
  "actions": [
    { "type": "navigate", "params": { "url": "https://www.example.com/some-page-with-pdf-link" } },
    { "type": "scrape", "params": { "selector": "a.pdf-link", "attribute": "href" } }
    // Worker executes these, result saved to DB: { "action_0": { "url": "..." }, "action_1": "https://example.com/document.pdf" }
  ]
}

// --- After Job 1 completes, retrieve the result (e.g., "https://example.com/document.pdf") ---

// --- JOB 2 ---
{
  "name": "Extract PDF Text",
  "actions": [
    // Use the result from Job 1 here
    { "type": "extractPDF", "params": { "url": "https://example.com/document.pdf" } }
    // Worker sends this to Crawl4AI service
  ]
}
```

## Contributing

Contributions are welcome! Please refer to the contribution guidelines.

## License

MIT

## Author

Keith Mzaza
