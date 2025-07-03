import { proxyActivities, sleep, log } from '@temporalio/workflow';
import type * as activities from './activities';

// Configure activity options
const { 
    processUserRegistration,
    sendWelcomeEmail,
    validateUserData,
    createUserProfile,
    sendNotification,
    auditLog 
} = proxyActivities<typeof activities>({
    startToCloseTimeout: '5 minutes',
    retry: {
        initialInterval: '1s',
        maximumInterval: '30s',
        backoffCoefficient: 2,
        maximumAttempts: 3,
    },
});

export interface UserRegistrationInput {
    email: string;
    name: string;
    userType: 'standard' | 'premium' | 'enterprise';
    metadata?: Record<string, any>;
}

export interface UserRegistrationResult {
    userId: string;
    status: 'completed' | 'failed';
    profileCreated: boolean;
    emailSent: boolean;
    message: string;
}

/**
 * User Registration Workflow
 * Handles complete user onboarding process
 */
export async function UserRegistrationWorkflow(
    input: UserRegistrationInput
): Promise<UserRegistrationResult> {
    log.info('🚀 Starting user registration workflow', { 
        email: input.email, 
        userType: input.userType 
    });

    try {
        // Step 1: Validate user data
        log.info('📋 Validating user data...');
        const validationResult = await validateUserData({
            email: input.email,
            name: input.name,
        });

        if (!validationResult.valid) {
            throw new Error(`Validation failed: ${validationResult.reason}`);
        }

        // Step 2: Process user registration
        log.info('⚙️ Processing user registration...');
        const registrationResult = await processUserRegistration({
            email: input.email,
            name: input.name,
            userType: input.userType,
            metadata: input.metadata,
        });

        // Step 3: Create user profile
        log.info('👤 Creating user profile...');
        const profileResult = await createUserProfile({
            userId: registrationResult.userId,
            email: input.email,
            name: input.name,
            userType: input.userType,
        });

        // Step 4: Send welcome email (async)
        log.info('📧 Sending welcome email...');
        const emailResult = await sendWelcomeEmail({
            email: input.email,
            name: input.name,
            userId: registrationResult.userId,
            userType: input.userType,
        });

        // Step 5: Send notification to admin
        await sendNotification({
            type: 'user_registered',
            message: `New ${input.userType} user registered: ${input.name} (${input.email})`,
            userId: registrationResult.userId,
        });

        // Step 6: Audit log
        await auditLog({
            action: 'user_registration_completed',
            userId: registrationResult.userId,
            details: {
                email: input.email,
                userType: input.userType,
                profileCreated: profileResult.success,
                emailSent: emailResult.sent,
            },
        });

        const result: UserRegistrationResult = {
            userId: registrationResult.userId,
            status: 'completed',
            profileCreated: profileResult.success,
            emailSent: emailResult.sent,
            message: `User registration completed successfully for ${input.name}`,
        };

        log.info('✅ User registration workflow completed', { result });
        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('❌ User registration workflow failed', { error: errorMessage });

        // Audit the failure
        await auditLog({
            action: 'user_registration_failed',
            details: {
                email: input.email,
                error: errorMessage,
            },
        });

        return {
            userId: '',
            status: 'failed',
            profileCreated: false,
            emailSent: false,
            message: `Registration failed: ${errorMessage}`,
        };
    }
}

export interface ApiRequestInput {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: any;
    userId?: string;
}

/**
 * API Integration Workflow
 * Handles external API calls with retry logic
 */
export async function ApiIntegrationWorkflow(
    input: ApiRequestInput
): Promise<any> {
    log.info('🌐 Starting API integration workflow', { 
        endpoint: input.endpoint, 
        method: input.method 
    });

    try {
        // Add delay for rate limiting
        await sleep('1s');

        // Process the API request
        const result = await processUserRegistration({
            email: 'api@example.com',
            name: 'API User',
            userType: 'standard',
            metadata: {
                apiEndpoint: input.endpoint,
                method: input.method,
                data: input.data,
            },
        });

        log.info('✅ API integration completed', { result });
        return result;

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error('❌ API integration failed', { error: errorMessage });
        throw error;
    }
}

/**
 * Simple Hello World Workflow for testing
 */
export async function HelloWorldWorkflow(name: string): Promise<string> {
    log.info('👋 Starting Hello World workflow', { name });
    
    const greeting = await validateUserData({ 
        email: `${name}@example.com`, 
        name 
    });
    
    const result = `Hello, ${name}! Welcome to Temporal TypeScript Workers!`;
    log.info('✅ Hello World completed', { result });
    
    return result;
}
