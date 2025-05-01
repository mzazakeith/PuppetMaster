import json
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel, Field

from ..service import crawler_service

# Define API models
class CrawlRequest(BaseModel):
    url: str = Field(..., description="URL to crawl")
    schema: Optional[Dict] = Field(None, description="Schema for extraction")
    strategy: Optional[str] = Field("JsonCssExtractionStrategy", description="Extraction strategy to use")
    baseSelector: Optional[str] = Field(None, description="Base selector for schema extraction")

class ExtractRequest(BaseModel):
    url: str = Field(..., description="URL to extract from")
    selector: str = Field(..., description="CSS selector or XPath expression")
    type: str = Field("text", description="Type of extraction (text, html, attribute)")
    attribute: Optional[str] = Field(None, description="Attribute name to extract")

class GenerateSchemaRequest(BaseModel):
    url: str = Field(..., description="URL to analyze")
    prompt: str = Field(..., description="Instructions for schema generation")
    model: Optional[str] = Field(None, description="Model to use for generation")

class VerifyRequest(BaseModel):
    url: str = Field(..., description="URL to verify")
    selector: str = Field(..., description="Element selector")
    expected: Optional[str] = Field(None, description="Expected text content")

class CrawlLinksRequest(BaseModel):
    url: str = Field(..., description="Starting URL")
    link_selector: str = Field(..., description="Selector for links to follow")
    schema: Optional[Dict] = Field(None, description="Schema for extraction")
    max_depth: int = Field(1, description="Maximum crawl depth")

class WaitRequest(BaseModel):
    url: str = Field(..., description="URL to load")
    selector: str = Field(..., description="Element to wait for")
    timeout: int = Field(30000, description="Maximum wait time in milliseconds")

class FilterRequest(BaseModel):
    url: str = Field(..., description="URL to extract from")
    selector: str = Field(..., description="Elements to select")
    condition: str = Field(..., description="Filtering condition")

class ScreenshotRequest(BaseModel):
    url: str = Field(..., description="URL to screenshot")
    selector: Optional[str] = Field(None, description="Optional element selector")
    full_page: bool = Field(False, description="Whether to capture the full page")

class PDFExtractRequest(BaseModel):
    url: str = Field(..., description="URL of the PDF")

class MarkdownRequest(BaseModel):
    url: str = Field(..., description="URL to convert to Markdown")
    options: Optional[Dict] = Field(None, description="Markdown generator options")

class PDFRequest(BaseModel):
    url: str = Field(..., description="URL to convert to PDF")

# Create router
router = APIRouter(prefix="/crawl4ai", tags=["crawl4ai"])

@router.post("/crawl")
async def crawl(request: CrawlRequest):
    """
    Crawl a webpage and extract structured data using a schema or extraction strategy.
    """
    result = await crawler_service.crawl(
        url=request.url,
        schema=request.schema,
        strategy=request.strategy
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.post("/extract")
async def extract(request: ExtractRequest):
    """
    Extract specific content from a webpage using CSS selectors or XPath.
    """
    result = await crawler_service.extract(
        url=request.url,
        selector=request.selector,
        extract_type=request.type,
        attribute=request.attribute
    )
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"data": result}

@router.post("/generate-schema")
async def generate_schema(request: GenerateSchemaRequest):
    """
    Dynamically generate a schema for structured data extraction using an LLM.
    """
    result = await crawler_service.generate_schema(
        url=request.url,
        prompt=request.prompt,
        model=request.model
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.post("/verify")
async def verify(request: VerifyRequest):
    """
    Verify if specific content exists on a webpage.
    """
    result = await crawler_service.verify(
        url=request.url,
        selector=request.selector,
        expected=request.expected
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.post("/crawl-links")
async def crawl_links(request: CrawlLinksRequest):
    """
    Crawl linked pages from a webpage and extract data from each.
    """
    result = await crawler_service.crawl_links(
        url=request.url,
        link_selector=request.link_selector,
        schema=request.schema,
        max_depth=request.max_depth
    )
    if isinstance(result, dict) and "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return {"data": result}

@router.post("/wait")
async def wait(request: WaitRequest):
    """
    Wait for an element to appear on the page.
    """
    result = await crawler_service.wait(
        url=request.url,
        selector=request.selector,
        timeout=request.timeout
    )
    if not result.get("success", False):
        raise HTTPException(status_code=500, detail=result.get("error", "Wait operation failed"))
    return result

@router.post("/filter")
async def filter_data(request: FilterRequest):
    """
    Filter extracted data based on a condition.
    """
    result = await crawler_service.filter(
        url=request.url,
        selector=request.selector,
        condition=request.condition
    )
    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])
    return result

@router.post("/screenshot")
async def take_screenshot(request: ScreenshotRequest):
    """
    Take a screenshot of a page or element.
    """
    result = await crawler_service.take_screenshot(
        url=request.url,
        selector=request.selector,
        full_page=request.full_page
    )
    if not result.get("success", False):
        raise HTTPException(status_code=500, detail=result.get("error", "Screenshot operation failed"))
    return result

@router.post("/extract-pdf")
async def extract_pdf(request: PDFExtractRequest):
    """
    Extract text from a PDF URL.
    """
    result = await crawler_service.extract_pdf(url=request.url)
    if not result.get("success", False):
        raise HTTPException(status_code=500, detail=result.get("error", "PDF extraction failed"))
    return result

@router.post("/to-markdown")
async def to_markdown(request: MarkdownRequest):
    """
    Convert webpage content to Markdown.
    """
    result = await crawler_service.generate_markdown(
        url=request.url,
        options=request.options
    )
    if not result.get("success", False):
        raise HTTPException(status_code=500, detail=result.get("error", "Markdown generation failed"))
    return result

@router.post("/to-pdf")
async def to_pdf(request: PDFRequest):
    """
    Convert webpage to a PDF file.
    """
    result = await crawler_service.generate_pdf(url=request.url)
    if not result.get("success", False):
        raise HTTPException(status_code=500, detail=result.get("error", "PDF generation failed"))
    return result 