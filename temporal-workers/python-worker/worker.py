#!/usr/bin/env python3
"""
Python Temporal Worker
Handles data processing, analytics, and ML workflows
"""

import asyncio
import logging
import os
import signal
import sys
from typing import Any, Dict

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker

# Import activities and workflows
from activities import (
    process_data,
    analyze_data,
    generate_report,
    send_email_report,
    store_results,
    audit_log
)
from workflows import (
    DataProcessingWorkflow,
    AnalyticsWorkflow,
    MLPipelineWorkflow
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class PythonTemporalWorker:
    """Python Temporal Worker for data processing and analytics"""
    
    def __init__(self):
        self.client = None
        self.worker = None
        self.running = False
        
        # Configuration from environment
        self.temporal_address = os.getenv('TEMPORAL_ADDRESS', 'temporal.temporal-cluster.local:7233')
        self.namespace = os.getenv('TEMPORAL_NAMESPACE', 'default')
        self.task_queue = os.getenv('TASK_QUEUE', 'python-workers')
        self.build_id = os.getenv('BUILD_ID', 'python-v1.0.0')
        
    async def start(self):
        """Start the Python worker"""
        logger.info("🚀 Starting Python Temporal Worker...")
        
        try:
            # Connect to Temporal
            self.client = await Client.connect(self.temporal_address)
            logger.info(f"✅ Connected to Temporal at {self.temporal_address}")
            
            # Create worker
            self.worker = Worker(
                self.client,
                task_queue=self.task_queue,
                workflows=[
                    DataProcessingWorkflow,
                    AnalyticsWorkflow,
                    MLPipelineWorkflow
                ],
                activities=[
                    process_data,
                    analyze_data,
                    generate_report,
                    send_email_report,
                    store_results,
                    audit_log
                ],
                build_id=self.build_id,
                use_worker_versioning=True,
                max_concurrent_activities=10,
                max_concurrent_workflows=10,
            )
            
            logger.info("✅ Python Worker Configuration:")
            logger.info(f"   - Task Queue: {self.task_queue}")
            logger.info(f"   - Build ID: {self.build_id}")
            logger.info(f"   - Temporal Address: {self.temporal_address}")
            logger.info(f"   - Namespace: {self.namespace}")
            logger.info(f"   - Versioning: Enabled")
            logger.info("")
            
            # Setup signal handlers
            self._setup_signal_handlers()
            
            # Start the worker
            logger.info("🔄 Worker starting...")
            self.running = True
            await self.worker.run()
            
        except Exception as e:
            logger.error(f"❌ Python Worker failed: {e}")
            sys.exit(1)
    
    def _setup_signal_handlers(self):
        """Setup graceful shutdown signal handlers"""
        def signal_handler(signum, frame):
            logger.info(f"\n🛑 Received signal {signum}, shutting down Python Worker...")
            self.running = False
            if self.worker:
                asyncio.create_task(self.worker.shutdown())
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
    
    async def stop(self):
        """Stop the worker gracefully"""
        if self.worker and self.running:
            logger.info("🛑 Stopping Python Worker...")
            await self.worker.shutdown()
            self.running = False

async def main():
    """Main entry point"""
    worker = PythonTemporalWorker()
    
    try:
        await worker.start()
    except KeyboardInterrupt:
        logger.info("\n🛑 Keyboard interrupt received")
    except Exception as e:
        logger.error(f"💥 Fatal error: {e}")
        sys.exit(1)
    finally:
        await worker.stop()
        logger.info("👋 Python Worker stopped")

if __name__ == "__main__":
    asyncio.run(main())
