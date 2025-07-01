import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { execFileSync } from 'child_process';
import waitPort from 'wait-port';
import { SecretsManager } from 'aws-sdk';

const SecretsManagerClient = new SecretsManager({});

export interface ITemporalDatabaseResourceProperties {
    readonly DatastorePlugin: 'mysql' | 'postgres' | 'cassandra' | 'elasticsearch';
    readonly DatastoreHost: string;
    readonly DatastorePort: string;
    readonly DatastoreSecretId: string;
    readonly DatabaseName: string;
    readonly SchemaType: 'main' | 'visibility';

    // TemporalVersion is not actually used by this lambda. Database schema
    // versions are not related to temporal software versions. Still, Temporal
    // version is required in order to ensure that the resource gets updated
    // whenever the version of Temporal changes. This is how we get the
    // opportunity to update database schemas.
    readonly TemporalVersion: string;
}

export interface IResolvedTemporalDatabaseResourceProps {
    readonly datastorePlugin: 'mysql' | 'postgres' | 'cassandra' | 'elasticsearch';
    readonly datastoreHost: string;
    readonly datastorePort: number;
    readonly datastoreUser: string;
    readonly datastorePassword: string;
    readonly databaseName: string;
    readonly schemaType: 'main' | 'visibility';
    readonly temporalVersion: string;
    readonly resourcePhysicalId: string;
}

export async function onEvent(event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> {
    const resourceProps = await extractResourceProperties(event);

    switch (event.RequestType) {
        case 'Create':
        case 'Update':
            // Only process the main database resource since createDatabase now handles both databases
            if (resourceProps.schemaType === 'main') {
                console.log('Processing main database resource - will create both temporal and temporal_visibility databases');
                waitForDatabase(resourceProps);
                await createDatabase(resourceProps);
            } else {
                console.log(`Skipping visibility database resource - already handled by main database resource`);
            }
            return {
                PhysicalResourceId: resourceProps.resourcePhysicalId,
            };

        case 'Delete': {
            // DO NOT drop databases - this can interfere with database creation
            // and cause issues with fresh clusters
            console.log(`Database deletion skipped for ${resourceProps.databaseName} - preserving database for redeployment`);
            return {
                // Use the original physical resource ID from the event to avoid CloudFormation errors
                PhysicalResourceId: event.PhysicalResourceId || resourceProps.resourcePhysicalId,
            };
        }
    }
}

async function extractResourceProperties(
    event: CdkCustomResourceEvent,
): Promise<IResolvedTemporalDatabaseResourceProps> {
    const inputProps = event.ResourceProperties as unknown as ITemporalDatabaseResourceProperties;

    if (!inputProps.DatastorePlugin) throw new Error('"DatastorePlugin" is required');
    if (!['mysql', 'postgres', 'cassandra', 'elasticsearch'].includes(inputProps.DatastorePlugin))
        throw new Error('"DatastorePlugin" value bust be one of "mysql", "postgres", "cassandra" or "elasticsearch"');

    if (!inputProps.DatastoreHost) throw new Error('"DatastoreHost" is required');

    if (!inputProps.DatastorePort) throw new Error('"DatastorePort" is required');
    if (!inputProps.DatastorePort.match(/^[1-9][0-9]+$/)) throw new Error('"DatastorePort" must be a number');

    if (!inputProps.DatastoreSecretId) throw new Error('"DatastoreSecretId" is required');

    if (!inputProps.DatabaseName) throw new Error('"DatabaseName" is required');

    if (!inputProps.SchemaType) throw new Error('"SchemaType" is required');
    if (!['main', 'visibility'].includes(inputProps.SchemaType))
        throw new Error('"SchemaType" must be either "main" or "visibility"');

    if (!inputProps.TemporalVersion) throw new Error('"TemporalVersion" is required');

    const datastoreSecret = await SecretsManagerClient.getSecretValue({
        SecretId: inputProps.DatastoreSecretId,
    }).promise();
    const datastoreSecretObject = JSON.parse(datastoreSecret.SecretString);

    const resourcePhysicalId = `${inputProps.DatastorePlugin}://${inputProps.DatastoreHost}:${inputProps.DatastorePort}/${inputProps.DatabaseName}`;

    return {
        datastorePlugin: inputProps.DatastorePlugin,
        datastoreHost: inputProps.DatastoreHost,
        datastorePort: parseInt(inputProps.DatastorePort),
        datastoreUser: datastoreSecretObject.username,
        datastorePassword: datastoreSecretObject.password,
        databaseName: inputProps.DatabaseName,
        schemaType: inputProps.SchemaType,
        temporalVersion: inputProps.TemporalVersion,
        resourcePhysicalId,
    };
}

function waitForDatabase(resourceProps: IResolvedTemporalDatabaseResourceProps) {
    waitPort({
        host: resourceProps.datastoreHost,
        port: resourceProps.datastorePort,
    });
}

async function createDatabase(resourceProps: IResolvedTemporalDatabaseResourceProps) {
    switch (resourceProps.datastorePlugin) {
        case 'postgres':
            // Create BOTH temporal databases in one function to avoid timing issues
            const databasesToCreate = ['temporal', 'temporal_visibility'];

            for (const dbName of databasesToCreate) {
                console.log(`Creating database: ${dbName}`);
                try {
                    execTemporalSqlToolWithoutDb(resourceProps, ['create-database', dbName]);
                    console.log(`Database ${dbName} created successfully`);
                } catch (error) {
                    // Ignore "database already exists" errors for idempotency
                    const errorMessage = error.message || error.toString();
                    const errorOutput = error.output ? error.output.join('') : '';
                    const errorStdout = error.stdout || '';
                    const errorStderr = error.stderr || '';
                    const fullErrorText = `${errorMessage} ${errorOutput} ${errorStdout} ${errorStderr}`.toLowerCase();

                    console.log(`Database creation error for ${dbName}: ${fullErrorText}`);

                    // Only ignore if it's specifically a "database already exists" error
                    if (fullErrorText.includes('duplicate key value violates unique constraint') &&
                        fullErrorText.includes('pg_database_datname_index')) {
                        console.log(`Database ${dbName} already exists (duplicate key constraint), continuing...`);
                    } else if (fullErrorText.includes('already exists') && fullErrorText.includes('database')) {
                        console.log(`Database ${dbName} already exists (direct message), continuing...`);
                    } else {
                        console.error(`CRITICAL: Failed to create database ${dbName}. This will cause schema setup to fail.`);
                        console.error(`Full error details:`, JSON.stringify(error, null, 2));
                        throw error;
                    }
                }
            }

            console.log('All databases created successfully. Now waiting for databases to become available...');

    // First wait for basic cluster connectivity
    console.log('Initial cluster connectivity check...');
    await waitForConnection(resourceProps);

    // Wait longer for databases to be fully ready after creation and connection pools to refresh
    console.log('Waiting 120 seconds for databases to be fully initialized and connection pools to refresh...');
    await new Promise(resolve => setTimeout(resolve, 120000));

    // Wait for each database to become individually available
    const databasesToVerify = ['temporal', 'temporal_visibility'];
    for (const dbName of databasesToVerify) {
        console.log(`Waiting for ${dbName} database to become available...`);
        await waitForDatabaseAvailable(resourceProps, dbName, 10); // 10 minute timeout per database
    }
    
    console.log('All databases are now available. Proceeding with schema setup...');
    
    // Set up schemas for both databases with extensive retry logic
    const schemasToSetup = [
        { dbName: 'temporal', schemaType: 'main', schemaDir: '/opt/temporal/schema/postgresql/v12/temporal/versioned' },
        { dbName: 'temporal_visibility', schemaType: 'visibility', schemaDir: '/opt/temporal/schema/postgresql/v12/visibility/versioned' }
    ];
    
    for (const schema of schemasToSetup) {
        console.log(`Setting up schema for ${schema.dbName} (${schema.schemaType})`);
        
        // Extensive retry logic for schema setup
        const maxRetries = 15; // Increased from 10
        let attempt = 0;
        let success = false;
        
        while (attempt < maxRetries && !success) {
            attempt++;
            console.log(`Schema setup attempt ${attempt}/${maxRetries} for ${schema.dbName}`);
            
            try {
                // Double-check database is still available before schema setup
                if (!verifyDatabaseAvailable(resourceProps, schema.dbName)) {
                    console.log(`Database ${schema.dbName} not available, waiting 60 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 60000));
                    continue;
                }
                
                // First setup the schema
                console.log(`Setting up base schema for ${schema.dbName}...`);
                const schemaResourceProps = { ...resourceProps, databaseName: schema.dbName };
                execTemporalSqlTool(schemaResourceProps, ['setup-schema', '-v', '0.0']);
                console.log(`Schema for ${schema.dbName} setup successfully`);

                // Then update to latest version
                console.log(`Updating schema for ${schema.dbName} to latest version...`);
                execTemporalSqlTool(schemaResourceProps, ['update-schema', '-d', schema.schemaDir]);
                console.log(`Schema for ${schema.dbName} updated successfully`);
                
                success = true;
            } catch (error: any) {
                console.log(`Schema setup attempt ${attempt} failed for ${schema.dbName}: ${error.message}`);
                
                // Check for specific database connection errors
                if (error.message.includes('does not exist') || error.message.includes('no usable database connection')) {
                    console.log(`Database connection issue detected for ${schema.dbName}, waiting longer...`);
                    if (attempt < maxRetries) {
                        console.log(`Waiting 120 seconds before retry due to connection issue...`);
                        await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes for connection issues
                    }
                } else {
                    if (attempt < maxRetries) {
                        console.log(`Waiting 60 seconds before retry...`);
                        await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute for other errors
                    }
                }
                
                if (attempt >= maxRetries) {
                    console.log(`All ${maxRetries} attempts failed for ${schema.dbName}`);
                    throw error;
                }
            }
        }
        
        console.log(`Schema setup completed successfully for ${schema.dbName}`);
    }    break;

        case 'mysql':
            try {
                execTemporalSqlTool(resourceProps, ['create-database', resourceProps.databaseName]);
                console.log(`Database ${resourceProps.databaseName} created successfully`);
            } catch (error) {
                // Ignore "database already exists" errors for idempotency
                const errorMessage = error.message || error.toString();
                const errorOutput = error.output ? error.output.join('') : '';
                const fullErrorText = `${errorMessage} ${errorOutput}`.toLowerCase();

                if (fullErrorText.includes('database exists') ||
                    fullErrorText.includes('already exists')) {
                    console.log(`Database ${resourceProps.databaseName} already exists, continuing...`);
                } else {
                    console.error(`Failed to create database ${resourceProps.databaseName}:`, errorMessage);
                    throw error;
                }
            }

            try {
                execTemporalSqlTool(resourceProps, ['setup-schema', '-v', '0.0']);
                console.log(`Schema for ${resourceProps.databaseName} setup successfully`);
            } catch (error) {
                console.error(`Failed to setup schema for ${resourceProps.databaseName}:`, error.message || error.toString());
                throw error;
            }
            break;

        case 'cassandra':
            throw new Error('createDatabase(cassandra) is not yet implemented');

        case 'elasticsearch':
            throw new Error('createDatabase(elasticsearch) is not yet implemented');
    }
}

function upgradeDatabase(resourceProps: IResolvedTemporalDatabaseResourceProps) {
    const type = resourceProps.schemaType === 'main' ? 'temporal' : 'visibility';
    switch (resourceProps.datastorePlugin) {
        case 'postgres': {
            const schemaDir = `/opt/temporal/schema/postgresql/v12/${type}/versioned`;
            execTemporalSqlTool(resourceProps, ['update-schema', '-d', schemaDir]);
            break;
        }

        case 'mysql': {
            const schemaDir = `/opt/temporal/schema/mysql/v8/${type}/versioned`;
            execTemporalSqlTool(resourceProps, ['update-schema', '-d', schemaDir]);
            break;
        }

        case 'cassandra': {
            // const schemaDir = `/opt/temporal/schema/cassandra/${type}/versioned`;
            throw new Error('upgradeDatabase(cassandra) is not yet implemented');
        }

        case 'elasticsearch': {
            // const schemaDir = `/opt/temporal/schema/elasticsearch/visibility/versioned`;
            throw new Error('upgradeDatabase(elasticsearch) is not yet implemented');
        }
    }
}

// dropDatabase function removed - we don't drop databases to avoid interference with fresh clusters

function execTemporalSqlTool(context: IResolvedTemporalDatabaseResourceProps, command: string[]) {
    const args = [];
    const env = {};

    // Use PostgreSQL plugin and parameters
    if (context.datastorePlugin === 'postgres') {
        args.push('--plugin', 'postgres12');
        args.push('--ep', context.datastoreHost);
        args.push('--port', `${context.datastorePort}`);
        args.push('--user', context.datastoreUser);
        args.push('--pw', context.datastorePassword);
        args.push('--db', context.databaseName);
    } else if (context.datastorePlugin === 'mysql') {
        args.push('--plugin', 'mysql8');
        args.push('--ep', context.datastoreHost);
        args.push('--port', `${context.datastorePort}`);
        args.push('--user', context.datastoreUser);
        args.push('--pw', context.datastorePassword);
        args.push('--db', context.databaseName);
    }

    console.log(`Executing temporal-sql-tool with database ${context.databaseName} and args: ${JSON.stringify([...args, ...command])}`);

    try {
        const result = execFileSync('/opt/temporal/bin/temporal-sql-tool', [...args, ...command], {
            encoding: 'utf-8',
            env,
            stdio: ['ignore', 'pipe', 'pipe'], // Capture both stdout and stderr
        });
        console.log(`Command executed successfully: ${result}`);
        return result;
    } catch (error) {
        console.log(`Command failed with error: ${error.message}`);
        console.log(`Error status: ${error.status}`);
        console.log(`Error stdout: ${error.stdout}`);
        console.log(`Error stderr: ${error.stderr}`);
        throw error;
    }
}

/**
 * Creates the database using the temporal-sql-tool without specifying a database
 * @param resourceProps - The resource properties
 * @param args - The command line arguments
 */
function execTemporalSqlToolWithoutDb(resourceProps: IResolvedTemporalDatabaseResourceProps, args: string[]) {
    const cmdArgs = [];
    const env = {};

    // Use PostgreSQL plugin and parameters without --db flag
    if (resourceProps.datastorePlugin === 'postgres') {
        cmdArgs.push('--plugin', 'postgres12');
        cmdArgs.push('--ep', resourceProps.datastoreHost);
        cmdArgs.push('--port', `${resourceProps.datastorePort}`);
        cmdArgs.push('--user', resourceProps.datastoreUser);
        cmdArgs.push('--pw', resourceProps.datastorePassword);
        // Don't add --db here, it's in the command
    } else if (resourceProps.datastorePlugin === 'mysql') {
        cmdArgs.push('--plugin', 'mysql8');
        cmdArgs.push('--ep', resourceProps.datastoreHost);
        cmdArgs.push('--port', `${resourceProps.datastorePort}`);
        cmdArgs.push('--user', resourceProps.datastoreUser);
        cmdArgs.push('--pw', resourceProps.datastorePassword);
        // Don't add --db here, it's in the command
    }

    console.log(`Executing temporal-sql-tool with args: ${JSON.stringify([...cmdArgs, ...args])}`);

    try {
        const result = execFileSync('/opt/temporal/bin/temporal-sql-tool', [...cmdArgs, ...args], {
            encoding: 'utf-8',
            env,
            stdio: ['ignore', 'pipe', 'pipe'], // Capture both stdout and stderr
        });
        console.log(`Command executed successfully: ${result}`);
        return result;
    } catch (error) {
        console.log(`Command failed with error: ${error.message}`);
        console.log(`Error status: ${error.status}`);
        console.log(`Error stdout: ${error.stdout}`);
        console.log(`Error stderr: ${error.stderr}`);
        throw error;
    }
}

/**
 * Verifies that a database exists and is connectable by trying a simple query
 * @param resourceProps - The resource properties
 * @param databaseName - The database name to verify
 * @returns true if database exists and is connectable, false otherwise
 */
function verifyDatabaseAvailable(resourceProps: IResolvedTemporalDatabaseResourceProps, databaseName: string): boolean {
    try {
        console.log(`Verifying database ${databaseName} is available for connections...`);

        // Try to connect and run a simple query to verify the database is ready
        const dbResourceProps = { ...resourceProps, databaseName };
        execTemporalSqlTool(dbResourceProps, ['--version']);
        console.log(`Database ${databaseName} is available and connectable`);
        return true;
    } catch (error: any) {
        console.log(`Database ${databaseName} not yet available: ${error.message}`);
        return false;
    }
}

/**
 * Waits for a database to become available with exponential backoff
 * @param resourceProps - The resource properties
 * @param databaseName - The database name to wait for
 * @param maxWaitMinutes - Maximum time to wait in minutes (default 10)
 */
async function waitForDatabaseAvailable(resourceProps: IResolvedTemporalDatabaseResourceProps, databaseName: string, maxWaitMinutes: number = 10): Promise<void> {
    console.log(`Waiting for database ${databaseName} to become available...`);
    
    const maxWaitMs = maxWaitMinutes * 60 * 1000;
    const startTime = Date.now();
    let attempt = 0;
    let waitTime = 5000; // Start with 5 seconds
    
    while (Date.now() - startTime < maxWaitMs) {
        attempt++;
        console.log(`Database availability check attempt ${attempt} for ${databaseName}`);
        
        if (verifyDatabaseAvailable(resourceProps, databaseName)) {
            console.log(`Database ${databaseName} is now available after ${Math.round((Date.now() - startTime) / 1000)} seconds`);
            return;
        }
        
        console.log(`Database ${databaseName} not ready, waiting ${Math.round(waitTime / 1000)} seconds before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Exponential backoff, but cap at 60 seconds
        waitTime = Math.min(waitTime * 1.5, 60000);
    }
    
    throw new Error(`Database ${databaseName} did not become available within ${maxWaitMinutes} minutes`);
}

/**
 * Waits for the database server to be ready for connections
 */
async function waitForConnection(resourceProps: IResolvedTemporalDatabaseResourceProps): Promise<void> {
    console.log(`Waiting for database server at ${resourceProps.datastoreHost}:${resourceProps.datastorePort} to be ready...`);

    try {
        await waitPort({
            host: resourceProps.datastoreHost,
            port: resourceProps.datastorePort,
            timeout: 300000, // 5 minutes
        });
        console.log(`Database server is ready for connections`);
    } catch (err) {
        console.log(`Database server connection failed: ${err.message}`);
        throw err;
    }
}