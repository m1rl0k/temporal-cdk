# Temporal Workers

This directory contains production-ready Temporal workers for different languages and use cases.

## 🏗️ **Worker Architecture**

```
temporal-workers/
├── typescript-worker/     # User workflows, API integrations
├── python-worker/         # Data processing, analytics, ML
└── go-worker/            # High-performance, system operations, Nexus
```

## 🎯 **Worker Responsibilities**

### **TypeScript Worker** (`typescript-workers` queue)
- **User Registration Workflows**: Complete onboarding process
- **API Integration Workflows**: External service calls with retry logic
- **Business Logic**: User-facing workflows and notifications
- **Build ID**: `typescript-v1.0.0`

### **Python Worker** (`python-workers` queue)
- **Data Processing Workflows**: ETL operations and transformations
- **Analytics Workflows**: Data analysis and reporting
- **ML Pipeline Workflows**: Model training and deployment
- **Build ID**: `python-v1.0.0`

### **Go Worker** (`go-workers` queue)
- **High-Performance Workflows**: System-level operations
- **Nexus Services**: Cross-namespace communication
- **Complex Processing**: Multi-step business workflows
- **Build ID**: `go-v1.0.0`

## 🚀 **Local Development**

### **TypeScript Worker**
```bash
cd typescript-worker
npm install
npm run build
npm start
```

### **Python Worker**
```bash
cd python-worker
pip install -r requirements.txt
python worker.py
```

### **Go Worker**
```bash
cd go-worker
go mod tidy
go run . worker
```

## 🐳 **Docker Deployment**

Each worker is designed to be built into Docker images using the CDK's sophisticated image builders:

- **TemporalNodejsWorkerImage**: For TypeScript workers
- **TemporalPythonWorkerImage**: For Python workers (to be created)
- **TemporalGoWorkerImage**: For Go workers (to be created)

## 📋 **Environment Variables**

All workers support these environment variables:

- `TEMPORAL_ADDRESS`: Temporal server address
- `TEMPORAL_NAMESPACE`: Temporal namespace (default: 'default')
- `TASK_QUEUE`: Worker task queue name
- `BUILD_ID`: Worker build ID for versioning
- `LOG_LEVEL`: Logging level (INFO, DEBUG, etc.)

## 🔧 **Worker Versioning**

All workers are configured with Worker Versioning enabled:

- **TypeScript**: `typescript-v1.0.0`
- **Python**: `python-v1.0.0`
- **Go**: `go-v1.0.0`

## 🌐 **Nexus Integration**

The Go worker includes Nexus service support for cross-namespace communication:

- **Endpoint**: `workflow-orchestrator`
- **Operations**: `echo`, `start-workflow`
- **Target Queue**: `go-workers`

## 📊 **Monitoring**

Workers include:

- **Health checks**: Process monitoring
- **Structured logging**: JSON formatted logs
- **Graceful shutdown**: SIGTERM/SIGINT handling
- **Activity timeouts**: Configurable timeouts
- **Retry policies**: Exponential backoff

## 🔄 **Deployment**

Workers are deployed via CDK using the `TemporalWorkers` construct:

```typescript
new TemporalWorkers(stack, 'TemporalWorkers', {
    cluster: ecsCluster,
    vpc: vpc,
    temporalCluster: temporalCluster,
    workers: {
        typescript: { enabled: true, desiredCount: 1 },
        python: { enabled: true, desiredCount: 1 },
        go: { enabled: true, desiredCount: 1 },
    },
});
```

## 🧪 **Testing**

Each worker includes example workflows that can be triggered for testing:

- **TypeScript**: User registration, API integration
- **Python**: Data processing, analytics, ML pipeline
- **Go**: Complex processing, Nexus operations
