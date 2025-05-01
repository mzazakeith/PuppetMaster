import os
import asyncio
import logging
from typing import Dict, Any, List, Optional

from ..service import crawler_service

logger = logging.getLogger("crawl4ai-worker")

class CrawlerWorker:
    """
    Worker for handling background Crawl4AI tasks.
    This worker integrates with the Node.js job queue system.
    """
    def __init__(self):
        self.crawler_service = crawler_service
    
    async def process_job(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a Crawl4AI job based on the action type
        
        Args:
            job_data: Job data with action type and parameters
            
        Returns:
            Result of the job execution
        """
        action_type = job_data.get("type")
        
        if not action_type:
            return {"error": "No action type specified"}
        
        try:
            if action_type == "crawl":
                return await self._handle_crawl(job_data)
            elif action_type == "extract":
                return await self._handle_extract(job_data)
            elif action_type == "generateSchema":
                return await self._handle_generate_schema(job_data)
            elif action_type == "verify":
                return await self._handle_verify(job_data)
            elif action_type == "crawlLinks":
                return await self._handle_crawl_links(job_data)
            elif action_type == "wait":
                return await self._handle_wait(job_data)
            elif action_type == "filter":
                return await self._handle_filter(job_data)
            else:
                return {"error": f"Unknown action type: {action_type}"}
                
        except Exception as e:
            logger.error(f"Error processing job: {str(e)}")
            return {"error": str(e)}
        finally:
            # Ensure browser is closed when job is done
            await self.crawler_service.close()
    
    async def _handle_crawl(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle crawl action"""
        url = job_data.get("url")
        schema = job_data.get("schema")
        strategy = job_data.get("strategy", "JsonCssExtractionStrategy")
        
        if not url:
            return {"error": "URL is required for crawl action"}
        
        return await self.crawler_service.crawl(url, schema, strategy)
    
    async def _handle_extract(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle extract action"""
        url = job_data.get("url")
        selector = job_data.get("selector")
        extract_type = job_data.get("type", "text")
        attribute = job_data.get("attribute")
        
        if not url or not selector:
            return {"error": "URL and selector are required for extract action"}
        
        result = await self.crawler_service.extract(url, selector, extract_type, attribute)
        
        # Standardize response format
        if isinstance(result, dict) and "error" in result:
            return result
        return {"data": result}
    
    async def _handle_generate_schema(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle generateSchema action"""
        url = job_data.get("url")
        prompt = job_data.get("prompt")
        model = job_data.get("model")
        
        if not url or not prompt:
            return {"error": "URL and prompt are required for generateSchema action"}
        
        return await self.crawler_service.generate_schema(url, prompt, model)
    
    async def _handle_verify(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle verify action"""
        url = job_data.get("url")
        selector = job_data.get("selector")
        expected = job_data.get("expected")
        
        if not url or not selector:
            return {"error": "URL and selector are required for verify action"}
        
        return await self.crawler_service.verify(url, selector, expected)
    
    async def _handle_crawl_links(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle crawlLinks action"""
        url = job_data.get("url")
        link_selector = job_data.get("linkSelector")
        schema = job_data.get("schema")
        max_depth = job_data.get("maxDepth", 1)
        
        if not url or not link_selector:
            return {"error": "URL and linkSelector are required for crawlLinks action"}
        
        result = await self.crawler_service.crawl_links(url, link_selector, schema, max_depth)
        
        # Standardize response format
        if isinstance(result, dict) and "error" in result:
            return result
        return {"data": result}
    
    async def _handle_wait(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle wait action"""
        url = job_data.get("url")
        selector = job_data.get("selector")
        timeout = job_data.get("timeout", 30000)
        
        if not url or not selector:
            return {"error": "URL and selector are required for wait action"}
        
        return await self.crawler_service.wait(url, selector, timeout)
    
    async def _handle_filter(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle filter action"""
        url = job_data.get("url")
        selector = job_data.get("selector")
        condition = job_data.get("condition")
        
        if not url or not selector or not condition:
            return {"error": "URL, selector, and condition are required for filter action"}
        
        return await self.crawler_service.filter(url, selector, condition)

# Create singleton instance
crawler_worker = CrawlerWorker() 