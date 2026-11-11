"""HTTP adapter for the repository's existing Python marketing utilities."""

import importlib.util
import asyncio
import logging
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from io import BytesIO

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from pypdf import PdfReader
from starlette.background import BackgroundTask

SCRIPTS_DIR = Path(os.getenv("SCRIPTS_DIR", "/app/scripts")).resolve()
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("aiscripto.python-worker")
app = FastAPI(title="AIScripto Marketing Utilities", version="1.0.0")


def load_script(name: str):
    script_path = (SCRIPTS_DIR / name).resolve()
    if script_path.parent != SCRIPTS_DIR or not script_path.is_file():
        raise HTTPException(status_code=503, detail=f"Utility {name} is unavailable")
    module_name = re.sub(r"\W+", "_", script_path.stem)
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise HTTPException(status_code=503, detail=f"Utility {name} could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@app.middleware("http")
async def verify_internal_worker_key(request: Request, call_next):
    if request.url.path != "/health":
        expected = os.getenv("WORKER_API_KEY")
        if not expected:
            return JSONResponse(status_code=503, content={"detail": "Worker authentication is not configured"})
        if request.headers.get("x-worker-key") != expected:
            return JSONResponse(status_code=401, content={"detail": "Worker authentication required"})
    return await call_next(request)


class AnalyzeRequest(BaseModel):
    url: str = Field(min_length=4, max_length=2048)
    task_id: Optional[str] = None


class CompetitorRequest(BaseModel):
    competitors: list[str] = Field(min_length=1, max_length=10)
    task_id: Optional[str] = None


class SocialCalendarRequest(BaseModel):
    topic: str = Field(min_length=2, max_length=500)
    brand: Optional[str] = Field(default=None, max_length=200)
    platforms: list[str] = Field(default_factory=lambda: ["instagram", "twitter", "linkedin"], max_length=6)
    days: int = Field(default=30, ge=1, le=90)
    task_id: Optional[str] = None


class PdfReportRequest(BaseModel):
    report_data: dict[str, Any]
    output_filename: Optional[str] = None
    task_id: Optional[str] = None


@app.get("/health")
async def health_check():
    names = ["analyze_page.py", "competitor_scanner.py", "social_calendar.py", "generate_pdf_report.py"]
    return {
        "status": "ok",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "scripts_available": [name for name in names if (SCRIPTS_DIR / name).is_file()],
    }


@app.post("/analyze-page")
async def analyze_page(request: AnalyzeRequest):
    try:
        module = load_script("analyze_page.py")
        result = await asyncio.to_thread(module.analyze, request.url)
        if result.get("status") != "success":
            raise HTTPException(status_code=422, detail=result.get("message", "Website analysis failed"))
        return {
            "task_id": request.task_id,
            "url": result["url"],
            "status": "completed",
            "data": result.get("analysis", {}),
            "analyzed_at": datetime.now(timezone.utc).isoformat(),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Page analysis failed")
        raise HTTPException(status_code=502, detail="Website analysis failed") from exc


@app.post("/scan-competitors")
async def scan_competitors(request: CompetitorRequest):
    try:
        module = load_script("competitor_scanner.py")
        results = await asyncio.to_thread(module.scan_multiple, request.competitors)
        return {
            "task_id": request.task_id,
            "status": "completed",
            "results": results,
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.exception("Competitor scan failed")
        raise HTTPException(status_code=502, detail="Competitor scan failed") from exc


@app.post("/extract-pdf-text")
async def extract_pdf_text(request: Request):
    raw = await request.body()
    if not raw or len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF must be between 1 byte and 10 MB")
    if not raw.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF")
    try:
        reader = PdfReader(BytesIO(raw), strict=True)
        if reader.is_encrypted:
            raise HTTPException(status_code=422, detail="Password-protected PDFs are not supported")
        if len(reader.pages) > 50:
            raise HTTPException(status_code=422, detail="PDFs are limited to 50 pages")
        parts = []
        remaining = 100_000
        for page in reader.pages:
            text = page.extract_text() or ""
            text = text[:remaining]
            parts.append(text)
            remaining -= len(text)
            if remaining <= 0:
                break
        extracted = "\n\n".join(parts).replace("\x00", "").strip()
        if not extracted:
            raise HTTPException(status_code=422, detail="No readable text was found in this PDF")
        return {"text": extracted, "page_count": len(reader.pages), "truncated": remaining <= 0}
    except HTTPException:
        raise
    except Exception as exc:
        logger.info("PDF text extraction rejected an unreadable document")
        raise HTTPException(status_code=422, detail="PDF could not be read") from exc


@app.post("/generate-social-calendar")
async def generate_social_calendar(request: SocialCalendarRequest):
    try:
        module = load_script("social_calendar.py")
        calendar = await asyncio.to_thread(
            module.generate_calendar,
            request.topic,
            request.platforms,
            request.days,
            request.brand,
        )
        return {
            "task_id": request.task_id,
            "status": "completed",
            "calendar": calendar,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as exc:
        logger.exception("Social calendar preparation failed")
        raise HTTPException(status_code=500, detail="Social calendar preparation failed") from exc


@app.post("/generate-pdf-report")
async def generate_pdf_report(request: PdfReportRequest):
    try:
        module = load_script("generate_pdf_report.py")
        raw_name = Path(request.output_filename or f"report-{request.task_id or 'export'}.pdf").name
        filename = re.sub(r"[^A-Za-z0-9._-]", "-", raw_name)
        if not filename.lower().endswith(".pdf"):
            filename += ".pdf"
        output_dir = Path(os.getenv("REPORT_OUTPUT_DIR", "/tmp/aiscripto-reports")).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / filename
        await asyncio.to_thread(module.generate_report, request.report_data, str(output_path))
        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=filename,
            background=BackgroundTask(output_path.unlink, missing_ok=True),
        )
    except Exception as exc:
        logger.exception("PDF report generation failed")
        raise HTTPException(status_code=500, detail="PDF report generation failed") from exc

