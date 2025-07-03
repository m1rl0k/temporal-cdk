"""
Python Temporal Activities
Data processing, analytics, and ML operations
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from temporalio import activity

logger = logging.getLogger(__name__)

# Input/Output data classes
@dataclass
class ProcessDataInput:
    dataset_id: str
    source_path: str
    processing_type: str = "standard"
    options: Dict[str, Any] = None

@dataclass
class AnalyzeDataInput:
    dataset_id: str
    analysis_type: str = "descriptive"
    parameters: Dict[str, Any] = None
    filters: Dict[str, Any] = None

@dataclass
class GenerateReportInput:
    dataset_id: str
    analysis_data: Dict[str, Any]
    report_type: str = "summary"
    format: str = "pdf"

@dataclass
class EmailReportInput:
    recipient: str
    report_path: str
    dataset_id: str
    subject: str

@dataclass
class StoreResultsInput:
    dataset_id: str
    data: Dict[str, Any]
    metadata: Dict[str, Any]
    storage_type: str

@dataclass
class AuditLogInput:
    action: str
    dataset_id: str = None
    details: Dict[str, Any] = None

@activity.defn
async def process_data(input: ProcessDataInput) -> Dict[str, Any]:
    """Process raw data with various transformation options"""
    logger.info(f"⚙️ Processing data for dataset: {input.dataset_id}")
    
    # Simulate data processing time
    processing_time = 2.0 if input.processing_type == "ml_training" else 1.0
    await asyncio.sleep(processing_time)
    
    # Simulate processing results
    record_count = 10000 if input.processing_type == "ml_training" else 5000
    
    result = {
        "dataset_id": input.dataset_id,
        "processed_data": {
            "records": record_count,
            "columns": ["id", "feature1", "feature2", "target"],
            "processing_type": input.processing_type,
            "transformations_applied": ["normalization", "feature_scaling"]
        },
        "metadata": {
            "source_path": input.source_path,
            "processing_timestamp": time.time(),
            "options": input.options or {}
        },
        "record_count": record_count,
        "processing_time": processing_time
    }
    
    logger.info(f"✅ Data processing completed for {input.dataset_id}: {record_count} records")
    return result

@activity.defn
async def analyze_data(input: AnalyzeDataInput) -> Dict[str, Any]:
    """Perform data analysis and generate insights"""
    logger.info(f"🔍 Analyzing data for dataset: {input.dataset_id} - Type: {input.analysis_type}")
    
    # Simulate analysis time based on type
    analysis_times = {
        "descriptive": 1.5,
        "predictive": 3.0,
        "prescriptive": 4.0
    }
    await asyncio.sleep(analysis_times.get(input.analysis_type, 2.0))
    
    # Generate simulated analysis results
    results = {
        "summary_statistics": {
            "mean": 42.5,
            "median": 41.0,
            "std_dev": 12.3,
            "min": 10.0,
            "max": 95.0
        },
        "insights": [
            "Strong correlation between feature1 and target variable",
            "Seasonal patterns detected in the data",
            "Outliers identified in 2.3% of records"
        ],
        "analysis_type": input.analysis_type,
        "confidence_score": 0.87
    }
    
    if input.analysis_type == "predictive":
        results["predictions"] = {
            "accuracy": 0.92,
            "precision": 0.89,
            "recall": 0.94
        }
    
    logger.info(f"✅ Data analysis completed for {input.dataset_id}")
    return {"results": results}

@activity.defn
async def generate_report(input: GenerateReportInput) -> Dict[str, Any]:
    """Generate reports from analysis data"""
    logger.info(f"📋 Generating {input.report_type} report for dataset: {input.dataset_id}")
    
    # Simulate report generation
    await asyncio.sleep(1.0)
    
    report_filename = f"{input.dataset_id}_{input.report_type}_{int(time.time())}.{input.format}"
    report_path = f"/reports/{report_filename}"
    
    # Simulate report content
    report_content = {
        "dataset_id": input.dataset_id,
        "report_type": input.report_type,
        "generated_at": time.time(),
        "format": input.format,
        "data": input.analysis_data
    }
    
    logger.info(f"✅ Report generated: {report_path}")
    
    return {
        "report_path": report_path,
        "report_filename": report_filename,
        "size_bytes": len(json.dumps(report_content)),
        "format": input.format
    }

@activity.defn
async def send_email_report(input: EmailReportInput) -> Dict[str, Any]:
    """Send report via email"""
    logger.info(f"📧 Sending email report to: {input.recipient}")
    
    # Simulate email sending
    await asyncio.sleep(0.5)
    
    message_id = f"msg_{int(time.time())}_{hash(input.recipient) % 10000}"
    
    logger.info(f"✅ Email report sent successfully. Message ID: {message_id}")
    
    return {
        "sent": True,
        "message_id": message_id,
        "recipient": input.recipient,
        "subject": input.subject
    }

@activity.defn
async def store_results(input: StoreResultsInput) -> Dict[str, Any]:
    """Store analysis results and data"""
    logger.info(f"💾 Storing {input.storage_type} results for dataset: {input.dataset_id}")
    
    # Simulate storage operation
    await asyncio.sleep(0.8)
    
    storage_location = f"/storage/{input.storage_type}/{input.dataset_id}_{int(time.time())}.json"
    
    # Simulate storage metadata
    storage_info = {
        "location": storage_location,
        "size_bytes": len(json.dumps(input.data)),
        "storage_type": input.storage_type,
        "stored_at": time.time(),
        "metadata": input.metadata
    }
    
    logger.info(f"✅ Results stored at: {storage_location}")
    
    return storage_info

@activity.defn
async def audit_log(input: AuditLogInput) -> None:
    """Log audit information"""
    audit_entry = {
        "action": input.action,
        "dataset_id": input.dataset_id,
        "details": input.details or {},
        "timestamp": time.time(),
        "worker_type": "python"
    }
    
    logger.info(f"📝 Audit log: {input.action}", extra=audit_entry)
    
    # Simulate audit logging
    await asyncio.sleep(0.2)
    
    logger.info("✅ Audit log recorded successfully")
