// Activities don't need special imports - they're just functions

export interface ValidationInput {
    email: string;
    name: string;
}

export interface ValidationResult {
    valid: boolean;
    reason?: string;
}

export interface RegistrationInput {
    email: string;
    name: string;
    userType: 'standard' | 'premium' | 'enterprise';
    metadata?: Record<string, any>;
}

export interface RegistrationResult {
    userId: string;
    success: boolean;
    message: string;
}

export interface ProfileInput {
    userId: string;
    email: string;
    name: string;
    userType: string;
}

export interface ProfileResult {
    success: boolean;
    profileId?: string;
    message: string;
}

export interface EmailInput {
    email: string;
    name: string;
    userId: string;
    userType: string;
}

export interface EmailResult {
    sent: boolean;
    messageId?: string;
    message: string;
}

export interface NotificationInput {
    type: string;
    message: string;
    userId?: string;
}

export interface AuditInput {
    action: string;
    userId?: string;
    details: Record<string, any>;
}

/**
 * Validate user data
 */
export async function validateUserData(input: ValidationInput): Promise<ValidationResult> {
    const { email, name } = input;
    
    console.log(`📋 Validating user data for: ${name} (${email})`);
    
    // Simulate validation logic
    if (!email || !email.includes('@')) {
        return {
            valid: false,
            reason: 'Invalid email format',
        };
    }
    
    if (!name || name.length < 2) {
        return {
            valid: false,
            reason: 'Name must be at least 2 characters',
        };
    }
    
    // Simulate async validation (e.g., checking against database)
    await new Promise(resolve => setTimeout(resolve, 500));
    
    console.log(`✅ User data validation successful for: ${name}`);
    return {
        valid: true,
    };
}

/**
 * Process user registration
 */
export async function processUserRegistration(input: RegistrationInput): Promise<RegistrationResult> {
    const { email, name, userType } = input;
    
    console.log(`⚙️ Processing registration for: ${name} (${email}) - Type: ${userType}`);
    
    // Simulate registration processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Generate user ID
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`✅ User registration processed successfully. User ID: ${userId}`);
    
    return {
        userId,
        success: true,
        message: `Registration completed for ${name}`,
    };
}

/**
 * Create user profile
 */
export async function createUserProfile(input: ProfileInput): Promise<ProfileResult> {
    const { userId, email, name, userType } = input;
    
    console.log(`👤 Creating profile for user: ${userId} (${name})`);
    
    // Simulate profile creation
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const profileId = `profile_${userId}`;
    
    console.log(`✅ User profile created successfully. Profile ID: ${profileId}`);
    
    return {
        success: true,
        profileId,
        message: `Profile created for ${name}`,
    };
}

/**
 * Send welcome email
 */
export async function sendWelcomeEmail(input: EmailInput): Promise<EmailResult> {
    const { email, name, userId, userType } = input;
    
    console.log(`📧 Sending welcome email to: ${email} (${name})`);
    
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    console.log(`✅ Welcome email sent successfully. Message ID: ${messageId}`);
    
    return {
        sent: true,
        messageId,
        message: `Welcome email sent to ${email}`,
    };
}

/**
 * Send notification
 */
export async function sendNotification(input: NotificationInput): Promise<void> {
    const { type, message, userId } = input;
    
    console.log(`🔔 Sending notification: ${type} - ${message}`);
    
    // Simulate notification sending
    await new Promise(resolve => setTimeout(resolve, 300));
    
    console.log(`✅ Notification sent successfully`);
}

/**
 * Audit log
 */
export async function auditLog(input: AuditInput): Promise<void> {
    const { action, userId, details } = input;
    
    console.log(`📝 Audit log: ${action}`, {
        userId,
        details,
        timestamp: new Date().toISOString(),
    });
    
    // Simulate audit logging
    await new Promise(resolve => setTimeout(resolve, 200));
    
    console.log(`✅ Audit log recorded successfully`);
}
