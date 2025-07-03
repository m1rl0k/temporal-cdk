import { Worker, NativeConnection } from '@temporalio/worker';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Dynamic TypeScript Worker that can handle any workflow/activity
 * Automatically discovers and registers workflows and activities from directories
 */

interface DynamicWorkerConfig {
    workflowsDir?: string;
    activitiesDir?: string;
    taskQueue?: string;
    namespace?: string;
    temporalAddress?: string;
    maxConcurrentWorkflowTasks?: number;
    maxConcurrentActivityTasks?: number;
}

export class DynamicTemporalWorker {
    private config: Required<DynamicWorkerConfig>;
    private worker?: Worker;

    constructor(config: DynamicWorkerConfig = {}) {
        this.config = {
            workflowsDir: config.workflowsDir || './workflows',
            activitiesDir: config.activitiesDir || './activities',
            taskQueue: config.taskQueue || process.env.TASK_QUEUE || 'dynamic-typescript-workers',
            namespace: config.namespace || process.env.TEMPORAL_NAMESPACE || 'default',
            temporalAddress: config.temporalAddress || process.env.TEMPORAL_ADDRESS || 'temporal.temporal-cluster.local:7233',
            maxConcurrentWorkflowTasks: config.maxConcurrentWorkflowTasks || 100,
            maxConcurrentActivityTasks: config.maxConcurrentActivityTasks || 100,
        };
    }

    /**
     * Dynamically discover and load all TypeScript files from a directory
     */
    private async discoverModules(directory: string): Promise<any[]> {
        const modules: any[] = [];
        
        if (!fs.existsSync(directory)) {
            console.log(`📁 Directory ${directory} not found, skipping...`);
            return modules;
        }

        const files = fs.readdirSync(directory);
        
        for (const file of files) {
            if (file.endsWith('.ts') || file.endsWith('.js')) {
                try {
                    const filePath = path.resolve(directory, file);
                    const module = await import(filePath);
                    modules.push(module);
                    console.log(`✅ Loaded module: ${file}`);
                } catch (error) {
                    console.warn(`⚠️ Failed to load ${file}:`, error);
                }
            }
        }

        return modules;
    }

    /**
     * Extract all exported functions from modules (for activities)
     */
    private extractActivities(modules: any[]): Record<string, Function> {
        const activities: Record<string, Function> = {};

        for (const module of modules) {
            for (const [name, value] of Object.entries(module)) {
                if (typeof value === 'function' && name !== 'default') {
                    activities[name] = value as Function;
                    console.log(`🔧 Registered activity: ${name}`);
                }
            }
        }

        return activities;
    }

    /**
     * Create workflow bundle path for dynamic workflows
     */
    private async createWorkflowBundle(): Promise<string> {
        // For dynamic workflows, we'll create a combined entry point
        const workflowsDir = path.resolve(this.config.workflowsDir);
        
        if (!fs.existsSync(workflowsDir)) {
            // Create a default workflows directory with a simple workflow
            fs.mkdirSync(workflowsDir, { recursive: true });
            
            const defaultWorkflow = `
import { log } from '@temporalio/workflow';

/**
 * Dynamic Hello World Workflow
 */
export async function DynamicHelloWorkflow(input: any): Promise<string> {
    log.info('🚀 Dynamic workflow started', { input });
    
    const result = \`Hello from dynamic worker! Input: \${JSON.stringify(input)}\`;
    log.info('✅ Dynamic workflow completed', { result });
    
    return result;
}

/**
 * Generic Data Processing Workflow
 */
export async function GenericDataProcessingWorkflow(data: any): Promise<any> {
    log.info('📊 Processing data', { data });
    
    // Simple data transformation
    const processed = {
        original: data,
        processed: true,
        timestamp: new Date().toISOString(),
        type: typeof data,
    };
    
    log.info('✅ Data processing completed', { processed });
    return processed;
}
`;
            
            fs.writeFileSync(path.join(workflowsDir, 'dynamic-workflows.ts'), defaultWorkflow);
            console.log('📝 Created default dynamic workflows');
        }

        return workflowsDir;
    }

    /**
     * Start the dynamic worker
     */
    async start(): Promise<void> {
        try {
            console.log('🚀 Starting Dynamic TypeScript Temporal Worker...');
            console.log('📋 Configuration:', {
                taskQueue: this.config.taskQueue,
                namespace: this.config.namespace,
                temporalAddress: this.config.temporalAddress,
                workflowsDir: this.config.workflowsDir,
                activitiesDir: this.config.activitiesDir,
            });

            // Connect to Temporal
            const connection = await NativeConnection.connect({
                address: this.config.temporalAddress,
            });

            // Discover and load activities
            const activityModules = await this.discoverModules(this.config.activitiesDir);
            const activities = this.extractActivities(activityModules);

            // Ensure workflows directory exists and get path
            const workflowsPath = await this.createWorkflowBundle();

            // Create worker
            this.worker = await Worker.create({
                connection,
                namespace: this.config.namespace,
                taskQueue: this.config.taskQueue,
                
                // Dynamic workflow registration
                workflowsPath: require.resolve(path.join(workflowsPath, 'dynamic-workflows.ts')),
                activities,
                
                // No versioning for maximum flexibility
                // buildId: undefined,
                // useVersioning: false,
                
                // High concurrency for handling many different job types
                maxConcurrentActivityTaskExecutions: this.config.maxConcurrentActivityTasks,
                maxConcurrentWorkflowTaskExecutions: this.config.maxConcurrentWorkflowTasks,
                
                // Enable debugging
                debugMode: process.env.NODE_ENV !== 'production',
            });

            console.log('✅ Dynamic Worker Configuration:');
            console.log(`   - Task Queue: ${this.config.taskQueue}`);
            console.log(`   - Workflows: ${Object.keys(activities).length > 0 ? 'Dynamically loaded' : 'Default workflows'}`);
            console.log(`   - Activities: ${Object.keys(activities).length} discovered`);
            console.log(`   - Temporal Address: ${this.config.temporalAddress}`);
            console.log(`   - Namespace: ${this.config.namespace}`);
            console.log(`   - Versioning: DISABLED (maximum flexibility)`);
            console.log(`   - Max Concurrent Workflows: ${this.config.maxConcurrentWorkflowTasks}`);
            console.log(`   - Max Concurrent Activities: ${this.config.maxConcurrentActivityTasks}\n`);

            // Start the worker
            console.log('🔄 Dynamic worker starting...');
            await this.worker.run();

        } catch (error) {
            console.error('❌ Dynamic TypeScript Worker failed:', error);
            process.exit(1);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        if (this.worker) {
            console.log('🛑 Shutting down dynamic worker...');
            this.worker.shutdown();
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down Dynamic Worker...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down Dynamic Worker...');
    process.exit(0);
});

// Auto-start if this file is run directly
if (require.main === module) {
    const worker = new DynamicTemporalWorker();
    worker.start().catch(console.error);
}
