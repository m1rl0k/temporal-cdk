/**
 * Generic Activities for Dynamic Worker
 * These activities can handle various types of data and operations
 */

export interface GenericInput {
    [key: string]: any;
}

export interface GenericOutput {
    success: boolean;
    result?: any;
    error?: string;
    timestamp: string;
    duration?: number;
}

/**
 * Generic HTTP Request Activity
 */
export async function httpRequest(input: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: any;
    timeout?: number;
}): Promise<GenericOutput> {
    const startTime = Date.now();
    console.log(`🌐 HTTP Request: ${input.method || 'GET'} ${input.url}`);
    
    try {
        // Simulate HTTP request (replace with actual HTTP client in production)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
        
        const mockResponse = {
            status: 200,
            data: { message: 'Success', url: input.url, method: input.method || 'GET' },
        };
        
        console.log(`✅ HTTP Request completed: ${input.url}`);
        
        return {
            success: true,
            result: mockResponse,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    } catch (error) {
        console.error(`❌ HTTP Request failed: ${input.url}`, error);
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    }
}

/**
 * Generic Data Transformation Activity
 */
export async function transformData(input: {
    data: any;
    transformType: 'uppercase' | 'lowercase' | 'reverse' | 'json' | 'base64' | 'hash';
    options?: Record<string, any>;
}): Promise<GenericOutput> {
    const startTime = Date.now();
    console.log(`🔄 Transforming data: ${input.transformType}`);
    
    try {
        let result: any;
        
        switch (input.transformType) {
            case 'uppercase':
                result = String(input.data).toUpperCase();
                break;
            case 'lowercase':
                result = String(input.data).toLowerCase();
                break;
            case 'reverse':
                result = String(input.data).split('').reverse().join('');
                break;
            case 'json':
                result = JSON.stringify(input.data, null, 2);
                break;
            case 'base64':
                result = Buffer.from(String(input.data)).toString('base64');
                break;
            case 'hash':
                // Simple hash simulation
                result = String(input.data).split('').reduce((a, b) => {
                    a = ((a << 5) - a) + b.charCodeAt(0);
                    return a & a;
                }, 0);
                break;
            default:
                throw new Error(`Unknown transform type: ${input.transformType}`);
        }
        
        console.log(`✅ Data transformation completed: ${input.transformType}`);
        
        return {
            success: true,
            result,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    } catch (error) {
        console.error(`❌ Data transformation failed: ${input.transformType}`, error);
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    }
}

/**
 * Generic Database Operation Activity
 */
export async function databaseOperation(input: {
    operation: 'create' | 'read' | 'update' | 'delete';
    table: string;
    data?: any;
    query?: any;
    options?: Record<string, any>;
}): Promise<GenericOutput> {
    const startTime = Date.now();
    console.log(`🗄️ Database operation: ${input.operation} on ${input.table}`);
    
    try {
        // Simulate database operation
        await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 200));
        
        let result: any;
        
        switch (input.operation) {
            case 'create':
                result = { id: Math.random().toString(36).substr(2, 9), ...input.data };
                break;
            case 'read':
                result = { id: '123', data: 'mock data', query: input.query };
                break;
            case 'update':
                result = { id: '123', updated: true, data: input.data };
                break;
            case 'delete':
                result = { id: '123', deleted: true };
                break;
            default:
                throw new Error(`Unknown operation: ${input.operation}`);
        }
        
        console.log(`✅ Database operation completed: ${input.operation}`);
        
        return {
            success: true,
            result,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    } catch (error) {
        console.error(`❌ Database operation failed: ${input.operation}`, error);
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    }
}

/**
 * Generic File Processing Activity
 */
export async function processFile(input: {
    operation: 'read' | 'write' | 'delete' | 'copy' | 'move';
    filePath: string;
    content?: string;
    destination?: string;
    options?: Record<string, any>;
}): Promise<GenericOutput> {
    const startTime = Date.now();
    console.log(`📁 File operation: ${input.operation} on ${input.filePath}`);
    
    try {
        // Simulate file operation
        await new Promise(resolve => setTimeout(resolve, Math.random() * 600 + 300));
        
        let result: any;
        
        switch (input.operation) {
            case 'read':
                result = { content: 'mock file content', size: 1024 };
                break;
            case 'write':
                result = { written: true, size: input.content?.length || 0 };
                break;
            case 'delete':
                result = { deleted: true };
                break;
            case 'copy':
                result = { copied: true, destination: input.destination };
                break;
            case 'move':
                result = { moved: true, destination: input.destination };
                break;
            default:
                throw new Error(`Unknown file operation: ${input.operation}`);
        }
        
        console.log(`✅ File operation completed: ${input.operation}`);
        
        return {
            success: true,
            result,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    } catch (error) {
        console.error(`❌ File operation failed: ${input.operation}`, error);
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    }
}

/**
 * Generic Notification Activity
 */
export async function sendNotification(input: {
    type: 'email' | 'sms' | 'slack' | 'webhook';
    recipient: string;
    message: string;
    subject?: string;
    options?: Record<string, any>;
}): Promise<GenericOutput> {
    const startTime = Date.now();
    console.log(`📢 Sending ${input.type} notification to ${input.recipient}`);
    
    try {
        // Simulate notification sending
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
        
        const result = {
            sent: true,
            type: input.type,
            recipient: input.recipient,
            messageId: Math.random().toString(36).substr(2, 12),
        };
        
        console.log(`✅ Notification sent: ${input.type} to ${input.recipient}`);
        
        return {
            success: true,
            result,
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    } catch (error) {
        console.error(`❌ Notification failed: ${input.type}`, error);
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    }
}

/**
 * Generic Delay/Sleep Activity
 */
export async function delay(input: {
    duration: number; // milliseconds
    message?: string;
}): Promise<GenericOutput> {
    const startTime = Date.now();
    console.log(`⏱️ Delaying for ${input.duration}ms: ${input.message || 'No message'}`);
    
    try {
        await new Promise(resolve => setTimeout(resolve, input.duration));
        
        console.log(`✅ Delay completed: ${input.duration}ms`);
        
        return {
            success: true,
            result: { delayed: input.duration, message: input.message },
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    } catch (error) {
        console.error(`❌ Delay failed`, error);
        
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
        };
    }
}
