# Azure AD/Entra ID Authentication for Temporal Web UI

This guide explains how to configure Microsoft Azure AD (Entra ID) authentication for your Temporal Web UI deployment.

## Overview

Temporal Web UI supports OIDC authentication, which allows integration with Microsoft Azure AD/Entra ID for single sign-on (SSO) access control.

## Prerequisites

- Azure AD tenant with admin access
- Temporal Web UI deployed and accessible
- Domain name for your Temporal Web UI (e.g., `temporal.yourdomain.com`)

## Azure AD Setup

### 1. Register Application in Azure AD

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: `Temporal Web UI`
   - **Supported account types**: Choose based on your needs
   - **Redirect URI**: `https://your-temporal-domain.com/auth/sso/callback`

### 2. Configure Application Settings

After registration, note down:
- **Application (client) ID**
- **Directory (tenant) ID**

### 3. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add description and set expiration
4. **Copy the secret value** (you won't see it again)

### 4. Configure API Permissions

1. Go to **API permissions**
2. Add the following **Microsoft Graph** permissions:
   - `openid` (delegated)
   - `profile` (delegated)
   - `email` (delegated)
   - `User.Read` (delegated)
3. Grant admin consent if required

## Configuration Options

### Option 1: Configuration File Approach

Update your `TemporalConfiguration.ts` file:

```typescript
const baseWebConfiguration = {
    temporalGrpcAddress: '', // Will be set dynamically
    port: 8080,
    enableUi: true,
    cors: {
        cookieInsecure: false,
        allowOrigins: ['*'],
        unsafeAllowAllOrigins: true,
    },
    refreshInterval: '1m',
    defaultNamespace: 'default',
    showTemporalSystemNamespace: false,
    notifyOnNewVersion: true,
    disableWriteActions: false,
    workflowTerminateDisabled: false,
    workflowCancelDisabled: false,
    workflowSignalDisabled: false,
    workflowResetDisabled: false,
    batchActionsDisabled: false,
    hideWorkflowQueryErrors: false,
    auth: {
        enabled: true,
        providers: [
            {
                label: "Microsoft",
                type: "oidc",
                providerUrl: "https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration",
                issuerUrl: "https://login.microsoftonline.com/{tenant-id}/v2.0",
                clientId: "{your-application-client-id}",
                clientSecret: "{your-application-client-secret}",
                callbackUrl: "https://your-temporal-domain.com/auth/sso/callback",
                scopes: ["openid", "profile", "email", "offline_access"]
            }
        ]
    },
    tls: {
        enableHostVerification: false,
    },
};
```

Add configuration method to your `TemporalConfiguration` class:

```typescript
public configureAzureAD(
    tenantId: string, 
    clientId: string, 
    clientSecret: string, 
    callbackUrl: string
): void {
    if (this.web.auth && this.web.auth.providers && this.web.auth.providers.length > 0) {
        const provider = this.web.auth.providers[0];
        provider.providerUrl = provider.providerUrl.replace('{tenant-id}', tenantId);
        provider.issuerUrl = provider.issuerUrl.replace('{tenant-id}', tenantId);
        provider.clientId = clientId;
        provider.clientSecret = clientSecret;
        provider.callbackUrl = callbackUrl;
    }
}
```

### Option 2: Environment Variables Approach (Recommended)

Update your WebService environment variables in `ServerServices.ts`:

```typescript
environment: {
    TEMPORAL_ADDRESS: cluster.host,
    TEMPORAL_UI_PORT: '8080',
    TEMPORAL_DEFAULT_NAMESPACE: 'default',
    TEMPORAL_DISABLE_WRITE_ACTIONS: 'false',
    TEMPORAL_SHOW_TEMPORAL_SYSTEM_NAMESPACE: 'false',
    TEMPORAL_NOTIFY_ON_NEW_VERSION: 'true',
    
    // Azure AD Authentication
    TEMPORAL_AUTH_ENABLED: 'true',
    TEMPORAL_AUTH_TYPE: 'oidc',
    TEMPORAL_AUTH_PROVIDER_URL: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
    TEMPORAL_AUTH_ISSUER_URL: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    TEMPORAL_AUTH_CLIENT_ID: clientId,
    TEMPORAL_AUTH_CLIENT_SECRET: clientSecret,
    TEMPORAL_AUTH_CALLBACK_URL: 'https://your-temporal-domain.com/auth/sso/callback',
    TEMPORAL_AUTH_SCOPES: 'openid,profile,email,offline_access',
}
```

## Implementation in CDK

### Using Configuration Method

```typescript
// In your stack or application code
temporalCluster.temporalConfig.configureAzureAD(
    'your-tenant-id',
    'your-client-id', 
    'your-client-secret',
    'https://your-temporal-domain.com/auth/sso/callback'
);
```

### Using Environment Variables with AWS Secrets Manager

For production deployments, store secrets securely:

```typescript
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';

const azureAdSecret = Secret.fromSecretNameV2(this, 'AzureAdSecret', 'temporal/azure-ad');

// In your WebService environment
environment: {
    // ... other variables
    TEMPORAL_AUTH_CLIENT_SECRET: azureAdSecret.secretValueFromJson('clientSecret').unsafeUnwrap(),
}
```

## Multi-Tenant Configuration

For organizations with multiple Azure AD tenants:

```typescript
// Use 'common' endpoint for multi-tenant support
TEMPORAL_AUTH_PROVIDER_URL: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
TEMPORAL_AUTH_ISSUER_URL: 'https://login.microsoftonline.com/common/v2.0',
```

## Testing the Setup

1. Deploy your updated Temporal Web UI configuration
2. Navigate to your Temporal Web UI URL
3. You should see a "Sign in with Microsoft" button
4. Click to authenticate with Azure AD
5. After successful authentication, you'll be redirected to the Temporal Web UI

## Troubleshooting

### Common Issues

1. **Redirect URI Mismatch**: Ensure the callback URL in Azure AD matches exactly
2. **CORS Issues**: Check that your domain is properly configured in CORS settings
3. **Token Validation Errors**: Verify tenant ID and issuer URL are correct
4. **Permission Denied**: Ensure proper API permissions are granted and consented

### Debug Steps

1. Check browser developer tools for authentication errors
2. Verify Azure AD application configuration
3. Check Temporal Web UI container logs for authentication failures
4. Validate environment variables are properly set

## Security Considerations

- Store client secrets in AWS Secrets Manager or similar secure storage
- Use HTTPS for all authentication flows
- Regularly rotate client secrets
- Monitor authentication logs for suspicious activity
- Consider using certificate-based authentication for enhanced security

## References

- [Temporal Web UI Authentication Documentation](https://docs.temporal.io/web-ui#authentication)
- [Microsoft Identity Platform Documentation](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [OIDC Specification](https://openid.net/connect/)
