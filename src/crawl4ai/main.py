#!/usr/bin/env python3
"""
Main entry point for Crawl4AI microservice
"""

import os
import sys
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Setup path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# Import app - Fix the import path to use relative import
from src.crawl4ai.app import start

if __name__ == "__main__":
    logging.info("Starting Crawl4AI microservice")
    start() 