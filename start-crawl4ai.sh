#!/bin/bash
# Script to start the Crawl4AI microservice

# Activate the virtual environment
source .venv/bin/activate

# Set environment variables if not already set
export CRAWL4AI_PORT="${CRAWL4AI_PORT:-8000}"
export ENVIRONMENT="${ENVIRONMENT:-development}"

# Start the microservice
echo "Starting Crawl4AI microservice on port $CRAWL4AI_PORT..."
python3 src/crawl4ai/main.py 