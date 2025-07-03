package main

import (
	"time"

	"go.temporal.io/sdk/workflow"
)

// ComplexProcessingInput represents input for complex processing workflow
type ComplexProcessingInput struct {
	DatasetID    string                 `json:"dataset_id"`
	ProcessType  string                 `json:"process_type"`
	Parameters   map[string]interface{} `json:"parameters"`
	Priority     string                 `json:"priority"`
}

// ComplexProcessingResult represents the result of complex processing
type ComplexProcessingResult struct {
	DatasetID       string                 `json:"dataset_id"`
	Status          string                 `json:"status"`
	ProcessedItems  int                    `json:"processed_items"`
	ProcessingTime  string                 `json:"processing_time"`
	OptimizationGain float64               `json:"optimization_gain"`
	Results         map[string]interface{} `json:"results"`
	Message         string                 `json:"message"`
}

// ComplexProcessingWorkflow handles high-performance data processing
func ComplexProcessingWorkflow(ctx workflow.Context, input ComplexProcessingInput) (ComplexProcessingResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("🚀 Starting complex processing workflow", "dataset_id", input.DatasetID, "process_type", input.ProcessType)

	// Configure activity options
	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: 10 * time.Minute,
		RetryPolicy: &workflow.RetryPolicy{
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    30 * time.Second,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	var result ComplexProcessingResult
	result.DatasetID = input.DatasetID
	result.Status = "processing"

	// Step 1: Process large dataset
	logger.Info("⚙️ Processing large dataset...")
	var processResult ProcessLargeDatasetResult
	err := workflow.ExecuteActivity(ctx, ProcessLargeDataset, ProcessLargeDatasetInput{
		DatasetID:   input.DatasetID,
		ProcessType: input.ProcessType,
		Parameters:  input.Parameters,
	}).Get(ctx, &processResult)
	if err != nil {
		logger.Error("❌ Failed to process dataset", "error", err)
		result.Status = "failed"
		result.Message = "Dataset processing failed: " + err.Error()
		return result, err
	}

	result.ProcessedItems = processResult.ItemsProcessed
	result.ProcessingTime = processResult.ProcessingTime

	// Step 2: Optimize performance
	logger.Info("🚀 Optimizing performance...")
	var optimizeResult OptimizePerformanceResult
	err = workflow.ExecuteActivity(ctx, OptimizePerformance, OptimizePerformanceInput{
		DatasetID: input.DatasetID,
		Algorithm: "advanced_optimization",
		Metrics:   processResult.Metrics,
	}).Get(ctx, &optimizeResult)
	if err != nil {
		logger.Error("❌ Failed to optimize performance", "error", err)
		// Continue without optimization
		result.OptimizationGain = 0.0
	} else {
		result.OptimizationGain = optimizeResult.PerformanceGain
	}

	// Step 3: System health check
	logger.Info("🔍 Performing system health check...")
	var healthResult SystemHealthCheckResult
	err = workflow.ExecuteActivity(ctx, SystemHealthCheck, SystemHealthCheckInput{
		CheckType: "post_processing",
		DatasetID: input.DatasetID,
	}).Get(ctx, &healthResult)
	if err != nil {
		logger.Error("❌ System health check failed", "error", err)
	}

	// Step 4: Cache results
	logger.Info("💾 Caching results...")
	err = workflow.ExecuteActivity(ctx, CacheOperation, CacheOperationInput{
		Operation: "store",
		Key:       "dataset_" + input.DatasetID,
		Data:      processResult.Results,
		TTL:       3600, // 1 hour
	}).Get(ctx, nil)
	if err != nil {
		logger.Error("❌ Failed to cache results", "error", err)
	}

	// Step 5: Audit log
	err = workflow.ExecuteActivity(ctx, AuditLog, AuditLogInput{
		Action:    "complex_processing_completed",
		DatasetID: input.DatasetID,
		Details: map[string]interface{}{
			"items_processed":   result.ProcessedItems,
			"processing_time":   result.ProcessingTime,
			"optimization_gain": result.OptimizationGain,
			"health_status":     healthResult.Status,
		},
	}).Get(ctx, nil)
	if err != nil {
		logger.Error("❌ Failed to audit log", "error", err)
	}

	result.Status = "completed"
	result.Results = processResult.Results
	result.Message = "Complex processing completed successfully"

	logger.Info("✅ Complex processing workflow completed", "result", result)
	return result, nil
}

// SystemOperationInput represents input for system operations
type SystemOperationInput struct {
	Operation   string                 `json:"operation"`
	Target      string                 `json:"target"`
	Parameters  map[string]interface{} `json:"parameters"`
	Timeout     int                    `json:"timeout"`
}

// SystemOperationWorkflow handles system-level operations
func SystemOperationWorkflow(ctx workflow.Context, input SystemOperationInput) (map[string]interface{}, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("🔧 Starting system operation workflow", "operation", input.Operation, "target", input.Target)

	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: time.Duration(input.Timeout) * time.Second,
		RetryPolicy: &workflow.RetryPolicy{
			InitialInterval:    time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    10 * time.Second,
			MaximumAttempts:    2,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	result := make(map[string]interface{})

	// Execute database operation
	var dbResult DatabaseOperationResult
	err := workflow.ExecuteActivity(ctx, DatabaseOperation, DatabaseOperationInput{
		Operation:  input.Operation,
		Target:     input.Target,
		Parameters: input.Parameters,
	}).Get(ctx, &dbResult)
	if err != nil {
		logger.Error("❌ Database operation failed", "error", err)
		result["status"] = "failed"
		result["error"] = err.Error()
		return result, err
	}

	result["database_result"] = dbResult
	result["status"] = "completed"
	result["message"] = "System operation completed successfully"

	logger.Info("✅ System operation workflow completed", "result", result)
	return result, nil
}

// HighPerformanceInput represents input for high-performance workflows
type HighPerformanceInput struct {
	TaskType    string                 `json:"task_type"`
	Concurrency int                    `json:"concurrency"`
	Data        map[string]interface{} `json:"data"`
}

// HighPerformanceWorkflow handles high-performance parallel processing
func HighPerformanceWorkflow(ctx workflow.Context, input HighPerformanceInput) (map[string]interface{}, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("⚡ Starting high-performance workflow", "task_type", input.TaskType, "concurrency", input.Concurrency)

	activityOptions := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &workflow.RetryPolicy{
			InitialInterval:    500 * time.Millisecond,
			BackoffCoefficient: 2.0,
			MaximumInterval:    5 * time.Second,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOptions)

	// Execute parallel processing
	var processResult ProcessLargeDatasetResult
	err := workflow.ExecuteActivity(ctx, ProcessLargeDataset, ProcessLargeDatasetInput{
		DatasetID:   "high_perf_" + input.TaskType,
		ProcessType: "parallel",
		Parameters: map[string]interface{}{
			"concurrency": input.Concurrency,
			"data":        input.Data,
		},
	}).Get(ctx, &processResult)
	if err != nil {
		logger.Error("❌ High-performance processing failed", "error", err)
		return nil, err
	}

	result := map[string]interface{}{
		"status":           "completed",
		"items_processed":  processResult.ItemsProcessed,
		"processing_time":  processResult.ProcessingTime,
		"throughput":       float64(processResult.ItemsProcessed) / 60.0, // items per minute
		"results":          processResult.Results,
		"message":          "High-performance processing completed",
	}

	logger.Info("✅ High-performance workflow completed", "result", result)
	return result, nil
}
