package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"
)

func main() {
	// Get configuration from environment
	temporalAddress := getEnv("TEMPORAL_ADDRESS", "temporal.temporal-cluster.local:7233")
	namespace := getEnv("TEMPORAL_NAMESPACE", "default")
	taskQueue := getEnv("TASK_QUEUE", "go-workers")
	buildID := getEnv("BUILD_ID", "go-v1.0.0")

	log.Printf("🚀 Starting Go Temporal Worker...")
	log.Printf("   - Task Queue: %s", taskQueue)
	log.Printf("   - Build ID: %s", buildID)
	log.Printf("   - Temporal Address: %s", temporalAddress)
	log.Printf("   - Namespace: %s", namespace)
	log.Printf("   - Versioning: Enabled")

	// Create Temporal client
	c, err := client.Dial(client.Options{
		HostPort:  temporalAddress,
		Namespace: namespace,
	})
	if err != nil {
		log.Fatalf("❌ Unable to create Temporal client: %v", err)
	}
	defer c.Close()

	// Create worker
	w := worker.New(c, taskQueue, worker.Options{
		BuildID:                             buildID,
		UseBuildIDForVersioning:             true,
		MaxConcurrentActivityExecutions:     10,
		MaxConcurrentWorkflowTaskExecutions: 10,
	})

	// Register workflows and activities
	w.RegisterWorkflow(ComplexProcessingWorkflow)
	w.RegisterWorkflow(SystemOperationWorkflow)
	w.RegisterWorkflow(HighPerformanceWorkflow)

	w.RegisterActivity(ProcessLargeDataset)
	w.RegisterActivity(OptimizePerformance)
	w.RegisterActivity(SystemHealthCheck)
	w.RegisterActivity(DatabaseOperation)
	w.RegisterActivity(CacheOperation)
	w.RegisterActivity(AuditLog)

	log.Printf("✅ Go Worker registered workflows and activities")

	// Setup graceful shutdown
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle shutdown signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Printf("\n🛑 Received shutdown signal, stopping Go Worker...")
		cancel()
	}()

	// Start worker
	log.Printf("🔄 Worker starting...")
	err = w.Run(worker.InterruptCh())
	if err != nil {
		log.Fatalf("❌ Unable to start worker: %v", err)
	}

	log.Printf("👋 Go Worker stopped")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
