"""
Python Temporal Workflows
Data processing, analytics, and ML pipelines
"""

import asyncio
from datetime import timedelta
from typing import Any, Dict, List, Optional

from temporalio import workflow
from temporalio.common import RetryPolicy

# Import activity types
with workflow.unsafe.imports_passed_through():
    from activities import (
        ProcessDataInput,
        AnalyzeDataInput,
        GenerateReportInput,
        EmailReportInput,
        StoreResultsInput,
        AuditLogInput
    )

@workflow.defn
class DataProcessingWorkflow:
    """
    Data Processing Workflow
    Handles ETL operations and data transformation
    """
    
    @workflow.run
    async def run(self, input: Dict[str, Any]) -> Dict[str, Any]:
        workflow.logger.info(f"🚀 Starting data processing workflow for dataset: {input.get('dataset_id')}")
        
        try:
            # Step 1: Process raw data
            workflow.logger.info("⚙️ Processing raw data...")
            process_result = await workflow.execute_activity(
                "process_data",
                ProcessDataInput(
                    dataset_id=input["dataset_id"],
                    source_path=input["source_path"],
                    processing_type=input.get("processing_type", "standard"),
                    options=input.get("options", {})
                ),
                start_to_close_timeout=timedelta(minutes=10),
                retry_policy=RetryPolicy(
                    initial_interval=timedelta(seconds=1),
                    maximum_interval=timedelta(seconds=30),
                    backoff_coefficient=2.0,
                    maximum_attempts=3
                )
            )
            
            # Step 2: Store processed results
            workflow.logger.info("💾 Storing processed results...")
            store_result = await workflow.execute_activity(
                "store_results",
                StoreResultsInput(
                    dataset_id=input["dataset_id"],
                    data=process_result["processed_data"],
                    metadata=process_result["metadata"],
                    storage_type="processed"
                ),
                start_to_close_timeout=timedelta(minutes=5)
            )
            
            # Step 3: Audit log
            await workflow.execute_activity(
                "audit_log",
                AuditLogInput(
                    action="data_processing_completed",
                    dataset_id=input["dataset_id"],
                    details={
                        "records_processed": process_result["record_count"],
                        "processing_time": process_result["processing_time"],
                        "storage_location": store_result["location"]
                    }
                ),
                start_to_close_timeout=timedelta(minutes=1)
            )
            
            result = {
                "dataset_id": input["dataset_id"],
                "status": "completed",
                "records_processed": process_result["record_count"],
                "storage_location": store_result["location"],
                "message": f"Data processing completed for dataset {input['dataset_id']}"
            }
            
            workflow.logger.info("✅ Data processing workflow completed", extra=result)
            return result
            
        except Exception as e:
            workflow.logger.error(f"❌ Data processing workflow failed: {e}")
            
            # Audit the failure
            await workflow.execute_activity(
                "audit_log",
                AuditLogInput(
                    action="data_processing_failed",
                    dataset_id=input["dataset_id"],
                    details={"error": str(e)}
                ),
                start_to_close_timeout=timedelta(minutes=1)
            )
            
            raise

@workflow.defn
class AnalyticsWorkflow:
    """
    Analytics Workflow
    Performs data analysis and generates insights
    """
    
    @workflow.run
    async def run(self, input: Dict[str, Any]) -> Dict[str, Any]:
        workflow.logger.info(f"📊 Starting analytics workflow for dataset: {input.get('dataset_id')}")
        
        try:
            # Step 1: Analyze data
            workflow.logger.info("🔍 Analyzing data...")
            analysis_result = await workflow.execute_activity(
                "analyze_data",
                AnalyzeDataInput(
                    dataset_id=input["dataset_id"],
                    analysis_type=input.get("analysis_type", "descriptive"),
                    parameters=input.get("parameters", {}),
                    filters=input.get("filters", {})
                ),
                start_to_close_timeout=timedelta(minutes=15)
            )
            
            # Step 2: Generate report
            workflow.logger.info("📋 Generating analysis report...")
            report_result = await workflow.execute_activity(
                "generate_report",
                GenerateReportInput(
                    dataset_id=input["dataset_id"],
                    analysis_data=analysis_result["results"],
                    report_type=input.get("report_type", "summary"),
                    format=input.get("format", "pdf")
                ),
                start_to_close_timeout=timedelta(minutes=5)
            )
            
            # Step 3: Send email report (if requested)
            if input.get("send_email", False):
                workflow.logger.info("📧 Sending email report...")
                await workflow.execute_activity(
                    "send_email_report",
                    EmailReportInput(
                        recipient=input["email_recipient"],
                        report_path=report_result["report_path"],
                        dataset_id=input["dataset_id"],
                        subject=f"Analytics Report - {input['dataset_id']}"
                    ),
                    start_to_close_timeout=timedelta(minutes=2)
                )
            
            # Step 4: Store analysis results
            await workflow.execute_activity(
                "store_results",
                StoreResultsInput(
                    dataset_id=input["dataset_id"],
                    data=analysis_result["results"],
                    metadata={
                        "analysis_type": input.get("analysis_type"),
                        "report_path": report_result["report_path"]
                    },
                    storage_type="analytics"
                ),
                start_to_close_timeout=timedelta(minutes=3)
            )
            
            result = {
                "dataset_id": input["dataset_id"],
                "status": "completed",
                "analysis_type": input.get("analysis_type"),
                "report_path": report_result["report_path"],
                "insights_count": len(analysis_result["results"].get("insights", [])),
                "message": f"Analytics completed for dataset {input['dataset_id']}"
            }
            
            workflow.logger.info("✅ Analytics workflow completed", extra=result)
            return result
            
        except Exception as e:
            workflow.logger.error(f"❌ Analytics workflow failed: {e}")
            raise

@workflow.defn
class MLPipelineWorkflow:
    """
    Machine Learning Pipeline Workflow
    Handles model training, validation, and deployment
    """
    
    @workflow.run
    async def run(self, input: Dict[str, Any]) -> Dict[str, Any]:
        workflow.logger.info(f"🤖 Starting ML pipeline workflow for model: {input.get('model_name')}")
        
        try:
            # Step 1: Process training data
            workflow.logger.info("📊 Processing training data...")
            training_data = await workflow.execute_activity(
                "process_data",
                ProcessDataInput(
                    dataset_id=input["training_dataset_id"],
                    source_path=input["training_data_path"],
                    processing_type="ml_training",
                    options=input.get("preprocessing_options", {})
                ),
                start_to_close_timeout=timedelta(minutes=20)
            )
            
            # Step 2: Train model (simulated)
            workflow.logger.info("🎯 Training ML model...")
            await asyncio.sleep(2)  # Simulate training time
            
            # Step 3: Validate model (simulated)
            workflow.logger.info("✅ Validating model...")
            await asyncio.sleep(1)  # Simulate validation time
            
            # Step 4: Generate model report
            model_report = await workflow.execute_activity(
                "generate_report",
                GenerateReportInput(
                    dataset_id=input["training_dataset_id"],
                    analysis_data={
                        "model_name": input["model_name"],
                        "accuracy": 0.95,  # Simulated
                        "training_samples": training_data["record_count"]
                    },
                    report_type="ml_model",
                    format="json"
                ),
                start_to_close_timeout=timedelta(minutes=3)
            )
            
            # Step 5: Store model artifacts
            await workflow.execute_activity(
                "store_results",
                StoreResultsInput(
                    dataset_id=input["model_name"],
                    data={
                        "model_path": f"/models/{input['model_name']}.pkl",
                        "metrics": {"accuracy": 0.95, "f1_score": 0.93}
                    },
                    metadata={
                        "model_type": input.get("model_type", "classification"),
                        "training_dataset": input["training_dataset_id"]
                    },
                    storage_type="ml_model"
                ),
                start_to_close_timeout=timedelta(minutes=5)
            )
            
            result = {
                "model_name": input["model_name"],
                "status": "completed",
                "accuracy": 0.95,
                "training_samples": training_data["record_count"],
                "model_path": f"/models/{input['model_name']}.pkl",
                "message": f"ML pipeline completed for model {input['model_name']}"
            }
            
            workflow.logger.info("✅ ML pipeline workflow completed", extra=result)
            return result
            
        except Exception as e:
            workflow.logger.error(f"❌ ML pipeline workflow failed: {e}")
            raise
