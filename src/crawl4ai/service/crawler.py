import os
import json
import asyncio
import logging
from typing import Dict, List, Any, Optional, Union
import io
import requests
from PyPDF2 import PdfReader
import uuid

# Update these imports to properly reference the installed package
from crawl4ai import AsyncWebCrawler
from crawl4ai.extraction_strategy import JsonCssExtractionStrategy, JsonXPathExtractionStrategy, LLMExtractionStrategy
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
from crawl4ai import BrowserConfig, CrawlerRunConfig, CacheMode
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("crawl4ai-service")

# Define simple schema classes for extraction
class ExtractionField(BaseModel):
    name: str
    selector: str
    type: str = "text"
    attribute: Optional[str] = None

class ExtractionSchema(BaseModel):
    name: str
    fields: List[ExtractionField]

class CrawlerService:
    """
    Service class to handle Crawl4AI operations.
    This is the main entry point for the microservice.
    """
    def __init__(self):
        # Initialize any config here
        self.crawler = None
        self.base_output_dir = os.path.join(os.getcwd(), 'public')
        
        # Ensure output directories exist
        os.makedirs(os.path.join(self.base_output_dir, 'screenshots'), exist_ok=True)
        os.makedirs(os.path.join(self.base_output_dir, 'pdfs'), exist_ok=True)
        os.makedirs(os.path.join(self.base_output_dir, 'markdown'), exist_ok=True)
    
    async def initialize(self):
        """Initialize the crawler with browser instance"""
        if self.crawler is None:
            browser_config = BrowserConfig(headless=True)
            self.crawler = AsyncWebCrawler(config=browser_config)
            logger.info("Crawler initialized with browser")
    
    async def close(self):
        """Close browser and cleanup resources"""
        if self.crawler:
            await self.crawler.close()
            self.crawler = None
            logger.info("Crawler resources cleaned up")
    
    async def crawl(self, url: str, schema: Optional[Dict] = None, strategy: str = "JsonCssExtractionStrategy") -> Dict:
        """
        Crawl a webpage and extract structured data using a schema or extraction strategy.
        
        Args:
            url: The URL to crawl
            schema: Optional schema definition for extraction
            strategy: Strategy name to use for extraction
            
        Returns:
            Dictionary with extracted data
        """
        await self.initialize()
        
        try:
            # Convert schema dict to ExtractionSchema object if provided
            extraction_schema = None
            if schema:
                # Add a baseSelector if not already present, defaulting to "body"
                if "baseSelector" not in schema:
                    schema["baseSelector"] = "body"
                
                fields = [ExtractionField(**field) for field in schema.get("fields", [])]
                extraction_schema = ExtractionSchema(
                    name=schema.get("name", "Extraction"),
                    fields=fields
                )
                
                # Convert extraction_schema to dict and add baseSelector
                schema_dict = extraction_schema.model_dump()
                schema_dict["baseSelector"] = schema.get("baseSelector", "body")
            
            # Select the extraction strategy
            extraction_strategy = None
            if strategy == "JsonCssExtractionStrategy":
                extraction_strategy = JsonCssExtractionStrategy(schema=schema_dict if extraction_schema else None)
            elif strategy == "JsonXPathExtractionStrategy":
                extraction_strategy = JsonXPathExtractionStrategy(schema=schema_dict if extraction_schema else None)
            elif strategy == "LLMExtractionStrategy":
                # For LLM strategy we would need more parameters like config, instruction, etc.
                # Using a simple default here
                extraction_strategy = LLMExtractionStrategy(
                    provider="openai/gpt-4o-mini",
                    extraction_type="schema",
                    instruction="Extract structured data from the page"
                )
            
            # Create the crawl config
            crawl_config = CrawlerRunConfig(
                extraction_strategy=extraction_strategy,
                cache_mode=CacheMode.BYPASS
            )
            
            # Perform the crawl
            result = await self.crawler.arun(
                url=url,
                config=crawl_config
            )
            
            # Return a serializable format
            return {
                "success": result.success,
                "url": result.url,
                "extracted_content": result.extracted_content,
                "error_message": result.error_message
            }
            
        except Exception as e:
            logger.error(f"Error in crawl operation: {str(e)}")
            return {"error": str(e), "success": False}
    
    async def extract(self, url: str, selector: str, extract_type: str = "text", attribute: str = None) -> Any:
        """
        Extract specific content from a webpage using CSS selectors or XPath.
        
        Args:
            url: The URL to extract from
            selector: CSS selector or XPath expression
            extract_type: Type of extraction (text, html, attribute)
            attribute: Attribute name to extract (if type is attribute)
            
        Returns:
            Extracted content
        """
        await self.initialize()
        
        try:
            # Create a browser using Playwright directly
            from playwright.async_api import async_playwright
            
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                # Navigate to the URL
                await page.goto(url, wait_until="networkidle")
                
                # Get all elements matching the selector
                elements = await page.locator(selector).all()
                
                # Extract content from each element
                results = []
                for element in elements:
                    if extract_type == "text":
                        content = await element.text_content()
                        results.append(content)
                    elif extract_type == "html":
                        content = await element.inner_html()
                        results.append(content)
                    elif extract_type == "attribute" and attribute:
                        content = await element.get_attribute(attribute)
                        results.append(content)
                
                # Close the browser
                await browser.close()
                
                return results
            
        except Exception as e:
            logger.error(f"Error in extract operation: {str(e)}")
            return {"error": str(e), "success": False}
    
    async def generate_schema(self, url: str, prompt: str, model: str = None) -> Dict:
        """
        Dynamically generate a schema for structured data extraction using an LLM.
        
        Args:
            url: The URL to analyze
            prompt: Instructions for schema generation
            model: Optional model to use
            
        Returns:
            Generated schema
        """
        await self.initialize()
        
        try:
            # Default to gpt-4o-mini if no model specified
            model_provider = model or "openai/gpt-4o-mini"
            
            # Create an LLM extraction strategy with instructions to generate a schema
            extraction_strategy = LLMExtractionStrategy(
                provider=model_provider,
                extraction_type="block",
                instruction=f"Analyze this webpage and generate a JSON schema for extracting data. {prompt}"
            )
            
            # Create crawl config
            config = CrawlerRunConfig(
                extraction_strategy=extraction_strategy,
                cache_mode=CacheMode.BYPASS
            )
            
            # Run the crawler
            result = await self.crawler.arun(url=url, config=config)
            
            if not result.success:
                return {"error": result.error_message, "success": False}
            
            # Try to parse the extracted content as JSON
            try:
                schema = json.loads(result.extracted_content)
                return {
                    "success": True,
                    "schema": schema
                }
            except json.JSONDecodeError:
                # If it's not valid JSON, return it as a string
                return {
                    "success": True,
                    "text_result": result.extracted_content,
                    "error": "Unable to parse result as JSON schema"
                }
            
        except Exception as e:
            logger.error(f"Error in generate_schema operation: {str(e)}")
            return {"error": str(e), "success": False}
    
    async def verify(self, url: str, selector: str, expected: str = None) -> Dict:
        """
        Verify if specific content exists on a webpage.
        
        Args:
            url: The URL to verify
            selector: Element selector
            expected: Expected text content (optional)
            
        Returns:
            Verification result
        """
        await self.initialize()
        
        try:
            # Create a browser using Playwright directly
            from playwright.async_api import async_playwright
            
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                # Navigate to the URL
                await page.goto(url, wait_until="networkidle")
                
                # Get all elements matching the selector
                elements = await page.locator(selector).all()
                
                # Check if any elements exist
                exists = len(elements) > 0
                
                # If expected text is provided, verify content across all elements
                content_matches = False
                if exists and expected:
                    for element in elements:
                        content = await element.text_content()
                        if expected in content:
                            content_matches = True
                            break
                
                # Close the browser
                await browser.close()
                
                return {
                    "success": True,
                    "exists": exists,
                    "content_matches": content_matches if expected else None
                }
            
        except Exception as e:
            logger.error(f"Error in verify operation: {str(e)}")
            return {"error": str(e), "success": False}
    
    async def wait(self, url: str, selector: str, timeout: int = 30000) -> Dict:
        """
        Wait for an element to appear on the page.
        
        Args:
            url: The URL to load
            selector: Element to wait for
            timeout: Maximum wait time in milliseconds
            
        Returns:
            Success status
        """
        await self.initialize()
        
        try:
            # Create a browser using Playwright directly
            from playwright.async_api import async_playwright
            
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                # Navigate to the URL
                await page.goto(url, wait_until="networkidle")
                
                # Wait for any element matching the selector to be visible
                # Using first:true to get only the first element
                try:
                    await page.locator(selector).first.wait_for(timeout=timeout)
                except Exception:
                    # Handle case when first is not available
                    # Fall back to checking if elements exist
                    elements = await page.locator(selector).all()
                    if len(elements) == 0:
                        raise Exception(f"No elements found for selector '{selector}'")
                
                # Close the browser
                await browser.close()
                
                return {"success": True, "message": f"Element {selector} appeared within timeout"}
            
        except Exception as e:
            logger.error(f"Error in wait operation: {str(e)}")
            return {"error": str(e), "success": False}
    
    async def filter(self, url: str, selector: str, condition: str) -> Dict:
        """
        Filter extracted data based on a condition.
        
        Args:
            url: The URL to extract from
            selector: Elements to select
            condition: Filtering condition
            
        Returns:
            Filtered data
        """
        await self.initialize()
        
        try:
            # Create a browser using Playwright directly
            from playwright.async_api import async_playwright
            
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                # Navigate to the URL
                await page.goto(url, wait_until="networkidle")
                
                # Get all elements matching the selector
                elements = await page.locator(selector).all()
                
                # Parse the condition string
                condition_type = None
                condition_value = None
                
                if 'href.includes(' in condition:
                    condition_type = 'href'
                    condition_value = condition.replace('href.includes(', '').replace(')', '').replace('"', '').replace("'", '')
                elif 'text.includes(' in condition:
                    condition_type = 'text'
                    condition_value = condition.replace('text.includes(', '').replace(')', '').replace('"', '').replace("'", '')
                else:
                    # Default to text condition if not specified
                    condition_type = 'text'
                    condition_value = condition
                
                # Filter elements based on condition
                filtered_data = []
                for element in elements:
                    if condition_type == 'href':
                        try:
                            href = await element.get_attribute('href')
                            if href and condition_value in href:
                                filtered_data.append({
                                    "text": await element.text_content(),
                                    "href": href
                                })
                        except Exception as e:
                            logger.debug(f"Error getting href attribute: {str(e)}")
                    elif condition_type == 'text':
                        try:
                            text = await element.text_content()
                            if text and condition_value in text:
                                filtered_data.append({
                                    "text": text
                                })
                        except Exception as e:
                            logger.debug(f"Error getting text content: {str(e)}")
                
                # Close the browser
                await browser.close()
                
                return {"data": filtered_data, "success": True}
            
        except Exception as e:
            logger.error(f"Error in filter operation: {str(e)}")
            return {"error": str(e), "success": False}
    
    async def take_screenshot(self, url: str, selector: str = None, full_page: bool = False) -> Dict:
        """
        Take a screenshot of a page or element.
        
        Args:
            url: The URL to screenshot
            selector: Optional element selector
            full_page: Whether to capture the full page
            
        Returns:
            Path to the screenshot
        """
        await self.initialize()
        
        try:
            # Create a browser using Playwright directly
            from playwright.async_api import async_playwright
            
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                # Navigate to the URL
                await page.goto(url, wait_until="networkidle")
                
                screenshot_path = os.path.join(
                    self.base_output_dir, 
                    'screenshots', 
                    f"screenshot_{hash(url)}_{hash(selector) if selector else 'full'}.png"
                )
                
                if selector:
                    element = page.locator(selector)
                    await element.screenshot(path=screenshot_path)
                else:
                    await page.screenshot(path=screenshot_path, full_page=full_page)
                
                # Close the browser
                await browser.close()
                
                # Return relative path for API response
                relative_path = screenshot_path.replace(os.getcwd(), '')
                if relative_path.startswith('/'):
                    relative_path = relative_path[1:]
                    
                return {
                    "success": True, 
                    "path": relative_path,
                    "url": f"/public/screenshots/{os.path.basename(screenshot_path)}"
                }
            
        except Exception as e:
            logger.error(f"Error in screenshot operation: {str(e)}")
            return {"error": str(e), "success": False}
    
    async def extract_pdf(self, url: str) -> Dict:
        """
        Extract text from a PDF URL.
        
        Args:
            url: The URL of the PDF
            
        Returns:
            Extracted text
        """
        # Note: This method doesn't use the Playwright browser directly,
        # as it downloads and parses the PDF content.
        logger.info(f"Attempting to extract text from PDF URL: {url}")
        
        try:
            response = requests.get(url, timeout=30) # Adding a timeout
            response.raise_for_status()  # Raise an exception for bad status codes
            
            # Check content type
            content_type = response.headers.get('content-type')
            if 'application/pdf' not in content_type:
                 return {"error": f"URL does not point to a PDF. Content-Type: {content_type}", "success": False}

            # Read PDF content from memory
            pdf_file = io.BytesIO(response.content)
            reader = PdfReader(pdf_file)
            
            # Extract text from all pages
            extracted_text = ""
            for page in reader.pages:
                extracted_text += page.extract_text() + "\n"
            
            logger.info(f"Successfully extracted {len(extracted_text)} characters from PDF: {url}")
            return {"text": extracted_text.strip(), "success": True}
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error downloading PDF from {url}: {str(e)}")
            return {"error": f"Error downloading PDF: {str(e)}", "success": False}
        except Exception as e:
            # Catch potential PyPDF2 errors or other issues
            logger.error(f"Error processing PDF from {url}: {str(e)}")
            return {"error": f"Error processing PDF: {str(e)}", "success": False}

    async def crawl_links(self, url: str, link_selector: str, schema: Optional[Dict] = None, max_depth: int = 1) -> List[Dict]:
        """
        Crawl linked pages from a webpage and extract data from each.
        
        Args:
            url: The starting URL
            link_selector: Selector for links to follow
            schema: Schema for extraction
            max_depth: Maximum crawl depth
            
        Returns:
            List of results from each linked page
        """
        await self.initialize()
        
        try:
            # Convert schema dict to ExtractionSchema object if provided
            extraction_schema = None
            if schema:
                fields = [ExtractionField(**field) for field in schema.get("fields", [])]
                extraction_schema = ExtractionSchema(
                    name=schema.get("name", "LinkedPageExtraction"),
                    fields=fields
                )
            
            # Create a browser using Playwright directly
            from playwright.async_api import async_playwright
            
            # Get links from the main page
            links = []
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                # Navigate to the URL
                await page.goto(url, wait_until="networkidle")
                
                # Get all links
                link_elements = await page.locator(link_selector).all()
                
                # Extract href attributes
                for element in link_elements:
                    href = await element.get_attribute("href")
                    if href:
                        # Convert to absolute URL if needed
                        if href.startswith("/"):
                            # Parse the base URL
                            base_url = url
                            if "://" in base_url:
                                domain = base_url.split("://")[0] + "://" + base_url.split("://")[1].split("/")[0]
                                href = domain + href
                            else:
                                href = base_url + href
                        elif not href.startswith("http"):
                            # Relative URL
                            if url.endswith("/"):
                                href = url + href
                            else:
                                href = url + "/" + href
                        
                        links.append(href)
                
                # Close the browser
                await browser.close()
            
            # Limit to max_depth links
            links = links[:max_depth]
            
            # Create extraction strategy
            extraction_strategy = JsonCssExtractionStrategy(
                schema=extraction_schema.model_dump() if extraction_schema else None
            )
            
            # Create a config with the extraction strategy
            config = CrawlerRunConfig(
                extraction_strategy=extraction_strategy,
                cache_mode=CacheMode.BYPASS
            )
            
            # Crawl each link
            results = []
            for link in links:
                try:
                    # Use the AsyncWebCrawler for each link
                    crawler = AsyncWebCrawler(config=BrowserConfig(headless=True))
                    result = await crawler.arun(url=link, config=config)
                    results.append({
                        "url": link,
                        "success": result.success,
                        "data": result.extracted_content,
                        "error": result.error_message
                    })
                    await crawler.close()
                except Exception as e:
                    results.append({
                        "url": link,
                        "success": False,
                        "error": str(e)
                    })
            
            return results
            
        except Exception as e:
            logger.error(f"Error in crawl_links operation: {str(e)}")
            return {"error": str(e), "success": False}

    async def generate_markdown(self, url: str, options: Optional[Dict] = None) -> Dict:
        """
        Generate Markdown content from a webpage and save it to a file.
        
        Args:
            url: The URL to convert
            options: Optional dictionary of markdown generator options
            
        Returns:
            Dictionary with Markdown content, file path/URL, or error
        """
        await self.initialize()
        logger.info(f"Generating Markdown for URL: {url} with options: {options}")
        
        try:
            # Create markdown generator
            md_generator = DefaultMarkdownGenerator(options=options or {})
            
            # Create crawl config
            config = CrawlerRunConfig(
                markdown_generator=md_generator,
                cache_mode=CacheMode.BYPASS
            )
            
            # Perform the crawl
            result = await self.crawler.arun(url=url, config=config)
            
            if not result.success:
                return {"error": result.error_message, "success": False}
            
            # Check if markdown was generated
            markdown_content = getattr(result.markdown, 'raw_markdown', None)
            if markdown_content is None:
                markdown_content = result.markdown # Fallback for older versions or simple strings
                
            if not markdown_content:
                return {"error": "Markdown generation resulted in empty content", "success": False}

            # Generate a unique filename
            md_filename = f"{uuid.uuid4()}.md"
            md_path = os.path.join(self.base_output_dir, 'markdown', md_filename)
            
            # Save the markdown content to file
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(markdown_content)
                
            logger.info(f"Successfully generated and saved Markdown: {md_path} for URL: {url}")

            # Return relative path for API response
            relative_path = md_path.replace(os.getcwd(), '')
            if relative_path.startswith('/'):
                relative_path = relative_path[1:]

            return {
                "success": True,
                "url": result.url,
                "markdown": markdown_content,
                "path": relative_path,
                "file_url": f"/public/markdown/{md_filename}" # URL accessible via static file server
            }
            
        except Exception as e:
            logger.error(f"Error in generate_markdown operation for {url}: {str(e)}")
            return {"error": str(e), "success": False}

    async def generate_pdf(self, url: str) -> Dict:
        """
        Generate a PDF file from a webpage.
        
        Args:
            url: The URL to convert
            
        Returns:
            Dictionary with the path to the generated PDF or error
        """
        await self.initialize()
        logger.info(f"Generating PDF for URL: {url}")
        
        try:
            # Create crawl config to enable PDF generation
            config = CrawlerRunConfig(
                pdf=True,
                cache_mode=CacheMode.BYPASS
            )
            
            # Perform the crawl
            result = await self.crawler.arun(url=url, config=config)
            
            if not result.success:
                return {"error": result.error_message, "success": False}
            
            # Check if PDF data exists
            pdf_data = getattr(result, 'pdf', None)
            if not pdf_data:
                return {"error": "PDF data not found in crawl result", "success": False}
                
            # Generate a unique filename
            pdf_filename = f"{uuid.uuid4()}.pdf"
            pdf_path = os.path.join(self.base_output_dir, 'pdfs', pdf_filename)
            
            # Save the PDF data to file
            with open(pdf_path, "wb") as f:
                f.write(pdf_data)
            
            logger.info(f"Successfully generated PDF: {pdf_path} for URL: {url}")
            
            # Return relative path for API response
            relative_path = pdf_path.replace(os.getcwd(), '')
            if relative_path.startswith('/'):
                relative_path = relative_path[1:]
                
            return {
                "success": True,
                "path": relative_path,
                "url": f"/public/pdfs/{pdf_filename}" # URL accessible via static file server
            }
            
        except Exception as e:
            logger.error(f"Error in generate_pdf operation for {url}: {str(e)}")
            return {"error": str(e), "success": False}

# Create a singleton instance
crawler_service = CrawlerService() 