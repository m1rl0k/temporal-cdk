import { proxyActivities, log, sleep } from '@temporalio/workflow';

// Import activity types
type GenericActivities = typeof import('../activities/generic-activities');

// Configure activities with generous timeouts for flexibility
const {
    httpRequest,
    transformData,
    databaseOperation,
    processFile,
    sendNotification,
    delay,
} = proxyActivities<GenericActivities>({
    startToCloseTimeout: '10 minutes',
    retry: {
        initialInterval: '1s',
        maximumInterval: '30s',
        backoffCoefficient: 2,
        maximumAttempts: 3,
    },
});

/**
 * Dynamic Hello World Workflow
 */
export async function DynamicHelloWorkflow(input: any): Promise<string> {
    log.info('🚀 Dynamic workflow started', { input });
    
    const result = `Hello from dynamic worker! Input: ${JSON.stringify(input)}`;
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

/**
 * Generic Job Processor - Can handle any type of job
 */
export async function GenericJobProcessor(job: {
    type: 'http' | 'transform' | 'database' | 'file' | 'notification' | 'delay' | 'custom';
    payload: any;
    options?: any;
}): Promise<any> {
    log.info('🔄 Processing generic job', { type: job.type, payload: job.payload });
    
    try {
        let result: any;
        
        switch (job.type) {
            case 'http':
                result = await httpRequest(job.payload);
                break;
                
            case 'transform':
                result = await transformData(job.payload);
                break;
                
            case 'database':
                result = await databaseOperation(job.payload);
                break;
                
            case 'file':
                result = await processFile(job.payload);
                break;
                
            case 'notification':
                result = await sendNotification(job.payload);
                break;
                
            case 'delay':
                result = await delay(job.payload);
                break;
                
            case 'custom':
                // For custom jobs, just return the payload with processing metadata
                result = {
                    success: true,
                    result: job.payload,
                    processed: true,
                    timestamp: new Date().toISOString(),
                };
                break;
                
            default:
                throw new Error(`Unknown job type: ${job.type}`);
        }
        
        log.info('✅ Generic job completed', { type: job.type, result });
        return result;
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('❌ Generic job failed', { type: job.type, error: errorMessage });
        
        return {
            success: false,
            error: errorMessage,
            type: job.type,
            timestamp: new Date().toISOString(),
        };
    }
}

/**
 * Multi-Step Pipeline Workflow - Can chain multiple operations
 */
export async function MultiStepPipelineWorkflow(pipeline: {
    steps: Array<{
        type: 'http' | 'transform' | 'database' | 'file' | 'notification' | 'delay';
        payload: any;
        name?: string;
    }>;
    options?: {
        continueOnError?: boolean;
        delayBetweenSteps?: number;
    };
}): Promise<any> {
    log.info('🔗 Starting multi-step pipeline', { 
        stepCount: pipeline.steps.length,
        options: pipeline.options 
    });
    
    const results: any[] = [];
    const options = pipeline.options || {};
    
    for (let i = 0; i < pipeline.steps.length; i++) {
        const step = pipeline.steps[i];
        const stepName = step.name || `Step ${i + 1}`;
        
        log.info(`🔄 Executing ${stepName}`, { type: step.type, step: i + 1 });
        
        try {
            const result = await GenericJobProcessor({
                type: step.type,
                payload: step.payload,
            });
            
            results.push({
                step: i + 1,
                name: stepName,
                type: step.type,
                result,
                success: true,
            });
            
            log.info(`✅ ${stepName} completed`, { step: i + 1, result });
            
            // Optional delay between steps
            if (options.delayBetweenSteps && i < pipeline.steps.length - 1) {
                await sleep(options.delayBetweenSteps);
            }
            
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            log.error(`❌ ${stepName} failed`, { step: i + 1, error: errorMessage });
            
            results.push({
                step: i + 1,
                name: stepName,
                type: step.type,
                error: errorMessage,
                success: false,
            });
            
            // Stop pipeline if continueOnError is false
            if (!options.continueOnError) {
                log.error('🛑 Pipeline stopped due to error', { step: i + 1 });
                break;
            }
        }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    
    log.info('🏁 Pipeline completed', { 
        totalSteps: pipeline.steps.length,
        successCount,
        failureCount,
        results 
    });
    
    return {
        success: failureCount === 0,
        totalSteps: pipeline.steps.length,
        successCount,
        failureCount,
        results,
        timestamp: new Date().toISOString(),
    };
}
