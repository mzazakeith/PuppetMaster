import os
import json
import asyncio
import logging
from typing import Dict, Any

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routes import crawler_routes
from .service import crawler_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("crawl4ai-api")

# Create FastAPI app
app = FastAPI(
    title="Crawl4AI API",
    description="Web crawling and scraping API for PuppetMaster",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # This should be updated in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom exception handler
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "detail": "An internal server error occurred"}
    )

# Startup event
@app.on_event("startup")
async def startup_event():
    logger.info("Starting up Crawl4AI API server")
    # Pre-initialize the crawler service
    await crawler_service.initialize()
    logger.info("Crawl4AI service initialized")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Crawl4AI API server")
    await crawler_service.close()
    logger.info("Crawl4AI service shut down")

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "crawl4ai"}

# Include routes
app.include_router(crawler_routes)

def start():
    """Start the FastAPI app with Uvicorn server"""
    port = int(os.environ.get("CRAWL4AI_PORT", 8000))
    uvicorn.run(
        "src.crawl4ai.app:app",
        host="0.0.0.0",
        port=port,
        reload=os.environ.get("ENVIRONMENT") == "development",
        log_level="info"
    )

if __name__ == "__main__":
    start() 