# 🚀 Temporal Dynamic TypeScript Worker - Cheat Sheet

## 📋 **Quick Reference**

### **Worker Details:**
- **Task Queue**: `typescript-workers`
- **Temporal Address**: `temporal.temporal-cluster.local:7233`
- **Namespace**: `default`
- **Worker Type**: Dynamic (handles any job type)
- **Versioning**: Disabled (for maximum compatibility)

---

## 🎯 **Available Workflows**

### **1. DynamicHelloWorkflow**
Simple test workflow for basic functionality.

```bash
temporal workflow start \
  --type DynamicHelloWorkflow \
  --task-queue typescript-workers \
  --input '"Your message here"' \
  --address temporal.temporal-cluster.local:7233
```

### **2. GenericDataProcessingWorkflow**
Basic data processing with metadata.

```bash
temporal workflow start \
  --type GenericDataProcessingWorkflow \
  --task-queue typescript-workers \
  --input '{"name":"John","email":"john@example.com","data":"sample"}' \
  --address temporal.temporal-cluster.local:7233
```

### **3. GenericJobProcessor**
Universal job handler - can process any job type.

```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{"type":"JOBTYPE","payload":{"key":"value"}}' \
  --address temporal.temporal-cluster.local:7233
```

### **4. MultiStepPipelineWorkflow**
Chain multiple operations together.

```bash
temporal workflow start \
  --type MultiStepPipelineWorkflow \
  --task-queue typescript-workers \
  --input '{"steps":[{"type":"delay","payload":{"duration":1000}},{"type":"transform","payload":{"data":"test","transformType":"uppercase"}}]}' \
  --address temporal.temporal-cluster.local:7233
```

---

## 🔧 **Job Types for GenericJobProcessor**

### **HTTP Request Job**

**GET Request:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "http",
    "payload": {
      "url": "https://api.example.com/users",
      "method": "GET",
      "headers": {"Authorization": "Bearer token123"},
      "timeout": 5000
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**POST Request with Data:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "http",
    "payload": {
      "url": "https://api.example.com/users",
      "method": "POST",
      "headers": {"Content-Type": "application/json", "Authorization": "Bearer token123"},
      "body": {"name": "John Doe", "email": "john@example.com"},
      "timeout": 10000
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**API Health Check:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "http",
    "payload": {
      "url": "https://api.example.com/health",
      "method": "GET",
      "timeout": 3000
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

### **Data Transformation Job**

**Text to Uppercase:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "transform",
    "payload": {
      "data": "hello world",
      "transformType": "uppercase"
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**JSON Formatting:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "transform",
    "payload": {
      "data": {"name": "John", "age": 30, "city": "New York"},
      "transformType": "json"
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Base64 Encoding:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "transform",
    "payload": {
      "data": "sensitive data to encode",
      "transformType": "base64"
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**String Reversal:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "transform",
    "payload": {
      "data": "reverse this text",
      "transformType": "reverse"
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Hash Generation:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "transform",
    "payload": {
      "data": "data to hash",
      "transformType": "hash"
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Transform Types**: `uppercase`, `lowercase`, `reverse`, `json`, `base64`, `hash`

### **Database Operation Job**

**Create Record:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "database",
    "payload": {
      "operation": "create",
      "table": "users",
      "data": {"name": "John Doe", "email": "john@example.com", "role": "admin"}
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Read Record:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "database",
    "payload": {
      "operation": "read",
      "table": "users",
      "query": {"email": "john@example.com"}
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Update Record:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "database",
    "payload": {
      "operation": "update",
      "table": "users",
      "query": {"id": "123"},
      "data": {"role": "user", "last_login": "2025-07-02"}
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Delete Record:**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "database",
    "payload": {
      "operation": "delete",
      "table": "users",
      "query": {"id": "123"}
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Operations**: `create`, `read`, `update`, `delete`

### **File Processing Job**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "file",
    "payload": {
      "operation": "write",
      "filePath": "/tmp/test.txt",
      "content": "Hello World"
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Operations**: `read`, `write`, `delete`, `copy`, `move`

### **Notification Job**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "notification",
    "payload": {
      "type": "email",
      "recipient": "user@example.com",
      "message": "Your job completed successfully",
      "subject": "Job Notification"
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

**Notification Types**: `email`, `sms`, `slack`, `webhook`

### **Delay Job**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "delay",
    "payload": {
      "duration": 5000,
      "message": "Waiting 5 seconds"
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

### **Custom Job**
```bash
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue typescript-workers \
  --input '{
    "type": "custom",
    "payload": {
      "customData": "anything you want",
      "numbers": [1, 2, 3],
      "nested": {"key": "value"}
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

---

## 🔗 **Multi-Step Pipeline Examples**

### **Simple Pipeline**
```bash
temporal workflow start \
  --type MultiStepPipelineWorkflow \
  --task-queue typescript-workers \
  --input '{
    "steps": [
      {
        "type": "delay",
        "payload": {"duration": 1000, "message": "Starting pipeline"},
        "name": "Initialize"
      },
      {
        "type": "transform",
        "payload": {"data": "hello world", "transformType": "uppercase"},
        "name": "Transform Data"
      },
      {
        "type": "notification",
        "payload": {"type": "email", "recipient": "admin@example.com", "message": "Pipeline completed"},
        "name": "Send Notification"
      }
    ],
    "options": {
      "continueOnError": true,
      "delayBetweenSteps": 500
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

### **Data Processing Pipeline**
```bash
temporal workflow start \
  --type MultiStepPipelineWorkflow \
  --task-queue typescript-workers \
  --input '{
    "steps": [
      {
        "type": "http",
        "payload": {"url": "https://api.example.com/data", "method": "GET"},
        "name": "Fetch Data"
      },
      {
        "type": "transform",
        "payload": {"data": "fetched_data", "transformType": "json"},
        "name": "Format Data"
      },
      {
        "type": "database",
        "payload": {"operation": "create", "table": "processed_data", "data": {}},
        "name": "Store Data"
      }
    ],
    "options": {
      "continueOnError": false
    }
  }' \
  --address temporal.temporal-cluster.local:7233
```

---

## 📊 **Monitoring Commands**

### **List Running Workflows**
```bash
temporal workflow list --address temporal.temporal-cluster.local:7233
```

### **Show Workflow Details**
```bash
temporal workflow show --workflow-id WORKFLOW_ID --address temporal.temporal-cluster.local:7233
```

### **List Schedules**
```bash
temporal schedule list --address temporal.temporal-cluster.local:7233
```

### **Terminate Workflow**
```bash
temporal workflow terminate --workflow-id WORKFLOW_ID --address temporal.temporal-cluster.local:7233
```

### **Cancel Workflow**
```bash
temporal workflow cancel --workflow-id WORKFLOW_ID --address temporal.temporal-cluster.local:7233
```

---

## 🛠️ **Troubleshooting**

### **Check Worker Health**
```bash
aws ecs describe-services --cluster your-cluster-name --services temporal-typescript-worker --region us-west-2
```

### **View Worker Logs**
```bash
aws logs tail /aws/ecs/temporal-typescript-worker --follow --region us-west-2
```

### **Connect to Container**
```bash
# Get task ID first
aws ecs list-tasks --cluster your-cluster-name --service-name temporal-typescript-worker --region us-west-2

# Connect to container
aws ecs execute-command --cluster your-cluster-name --task TASK_ID --container TypeScriptWorkerContainer --command "sh" --interactive --region us-west-2
```

---

## 🎯 **Quick Test Commands**

### **Test Basic Functionality**
```bash
temporal workflow start --type DynamicHelloWorkflow --task-queue typescript-workers --input '"Quick test"' --address temporal.temporal-cluster.local:7233
```

### **Test Job Processing**
```bash
temporal workflow start --type GenericJobProcessor --task-queue typescript-workers --input '{"type":"delay","payload":{"duration":2000,"message":"Test job"}}' --address temporal.temporal-cluster.local:7233
```

### **Test Pipeline**
```bash
temporal workflow start --type MultiStepPipelineWorkflow --task-queue typescript-workers --input '{"steps":[{"type":"delay","payload":{"duration":1000}},{"type":"custom","payload":{"test":"data"}}]}' --address temporal.temporal-cluster.local:7233
```

---

## �️ **Development & Deployment**

### **Repository Structure**
```
temporal-workers/typescript-worker/
├── worker.ts                    # Main worker entry point
├── workflows/
│   └── dynamic-workflows.ts     # Add new workflows here
├── activities/
│   └── generic-activities.ts    # Add new activities here
├── package.json                 # Dependencies
├── tsconfig.json               # TypeScript config
└── Dockerfile                  # Container definition
```

### **Adding New Workflows**
1. Edit `temporal-workers/typescript-worker/workflows/dynamic-workflows.ts`
2. Export your new workflow function
3. Build and deploy (see deployment section)

### **Adding New Activities**
1. Edit `temporal-workers/typescript-worker/activities/generic-activities.ts`
2. Export your new activity function
3. Build and deploy

### **Modifying Worker Configuration**
Edit `temporal-workers/typescript-worker/worker.ts`:
- Change task queue name
- Modify connection settings
- Adjust worker options

### **CDK Configuration**
Main CDK files:
- `lib/services/TemporalWorkers.ts` - Worker service configuration
- `lib/TemporalNodejsWorkerImage.ts` - Docker image build
- `example-with-existing-cluster.ts` - Deployment script

### **Build and Deploy New Worker**
```bash
# 1. Make your changes to worker files
# 2. Build the CDK project
npm run build

# 3. Deploy to AWS
cdk deploy --app "npx ts-node example-with-existing-cluster.ts"

# 4. Monitor deployment
aws ecs describe-services --cluster your-cluster-name --services temporal-typescript-worker --region us-west-2
```

### **Local Development**

#### **Run Worker Locally**
```bash
# Test worker locally with custom task queue
cd temporal-workers/typescript-worker
npm install

# Use your own task queue to avoid conflicts with production
TEMPORAL_ADDRESS=temporal.temporal-cluster.local:7233 TASK_QUEUE=dev-yourname-queue npx ts-node dynamic-worker.ts
```

**Important**: Always use a custom task queue for local development to prevent your local worker from picking up production jobs from the `typescript-workers` queue.

#### **Test Workflows Locally**
Open a new terminal and run workflows against your local worker using YOUR custom task queue:

```bash
# Simple test workflow - use YOUR task queue name
temporal workflow start \
  --type DynamicHelloWorkflow \
  --task-queue dev-yourname-queue \
  --input '"Local development test"' \
  --address temporal.temporal-cluster.local:7233

# Test job processing - use YOUR task queue name
temporal workflow start \
  --type GenericJobProcessor \
  --task-queue dev-yourname-queue \
  --input '{"type":"delay","payload":{"duration":2000,"message":"Local test"}}' \
  --address temporal.temporal-cluster.local:7233

# Test pipeline - use YOUR task queue name
temporal workflow start \
  --type MultiStepPipelineWorkflow \
  --task-queue dev-yourname-queue \
  --input '{"steps":[{"type":"delay","payload":{"duration":1000}},{"type":"transform","payload":{"data":"local test","transformType":"uppercase"}}]}' \
  --address temporal.temporal-cluster.local:7233
```

#### **Task Queue Naming Convention**
- `dev-{yourname}-queue` - Personal development (e.g., `dev-john-queue`)
- `feature-{feature-name}-queue` - Feature development (e.g., `feature-auth-queue`)
- `test-{test-name}-queue` - Testing specific functionality
- **Never use `typescript-workers`** - This is the production queue

#### **Monitor Local Workflows**
```bash
# List running workflows
temporal workflow list --address temporal.temporal-cluster.local:7233

# Show specific workflow details
temporal workflow show --workflow-id WORKFLOW_ID --address temporal.temporal-cluster.local:7233

# Follow workflow execution
temporal workflow show --workflow-id WORKFLOW_ID --follow --address temporal.temporal-cluster.local:7233
```

#### **Create Your Own Task Queue for Development**
To avoid conflicts with production workers, create your own task queue:

**1. Start worker with custom task queue:**
```bash
cd temporal-workers/typescript-worker
TEMPORAL_ADDRESS=temporal.temporal-cluster.local:7233 TASK_QUEUE=dev-john-queue npx ts-node dynamic-worker.ts
```

**2. Test workflows on your custom queue:**
```bash
# Use your custom task queue name
temporal workflow start \
  --type DynamicHelloWorkflow \
  --task-queue dev-john-queue \
  --input '"My development test"' \
  --address temporal.temporal-cluster.local:7233
```

**3. Naming Convention for Task Queues:**
- `dev-{yourname}-queue` - Personal development
- `feature-{feature-name}-queue` - Feature development
- `test-{test-name}-queue` - Testing specific functionality

#### **Local Development Tips**
- Keep worker running in one terminal
- Test workflows in another terminal
- Check worker logs for activity processing
- Use `--follow` flag to watch workflow execution in real-time
- Network access to Temporal cluster required for all commands
- Always use your own task queue to avoid conflicts
- Production uses `typescript-workers` queue - don't use this locally

### **Docker Image Management**
The CDK automatically:
- Builds Docker image from `temporal-workers/typescript-worker/`
- Pushes to ECR repository
- Updates ECS service with new image
- Handles rolling deployment

### **Health Check Configuration**
Located in `lib/services/TemporalWorkers.ts`:
```typescript
private getHealthCheckCommand(workerType: string): string[] {
    case 'TypeScript':
        return ['CMD-SHELL', 'pgrep -f "ts-node" || exit 1'];
}
```

### **Environment Variables**
Set in CDK deployment:
- `TEMPORAL_ADDRESS` - Temporal server address
- `TEMPORAL_NAMESPACE` - Namespace (default: 'default')
- `TASK_QUEUE` - Task queue name
- `NODE_ENV` - Environment (production)

---

## �📝 **Notes**

- **Network Access Required**: Must have network access to reach `temporal.temporal-cluster.local:7233`
- **Worker Versioning**: Disabled for maximum compatibility
- **Health Checks**: Uses `pgrep -f "ts-node"` with procps package
- **Container**: Runs on ECS Fargate with 0.5 vCPU and 1GB RAM
- **Logs**: Available in CloudWatch at `/aws/ecs/temporal-typescript-worker`
- **Deployment Time**: ~5-10 minutes for full CDK deployment
- **Rolling Updates**: ECS handles zero-downtime deployments

