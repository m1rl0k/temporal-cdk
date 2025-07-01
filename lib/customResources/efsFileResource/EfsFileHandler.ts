import { dirname, join } from 'path';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';

export interface IEfsFileResourceProperties {
    readonly FileSystemId: string;
    readonly Path: string;
    readonly Contents: string;
}

export async function onEvent(event: CdkCustomResourceEvent) {
    switch (event.RequestType) {
        case 'Create':
        case 'Update':
            return putObject(event);

        case 'Delete':
            return deleteObject(event);
    }
}

export async function putObject(event: CdkCustomResourceEvent): Promise<CdkCustomResourceResponse> {
    const properties = event.ResourceProperties as unknown as IEfsFileResourceProperties;

    if (!properties.FileSystemId) throw new Error('"FileSystemId" is required');
    if (!properties.Contents) throw new Error('"Contents" is required');
    if (!properties.Path) throw new Error('"Path" is required');

    console.log(`Writing to file efs://${properties.FileSystemId}/${properties.Path}`);

    // Wait for EFS mount to be available with retry logic
    await waitForEfsMountAvailable(properties.FileSystemId, 300000); // 5 minute timeout

    try {
        // Create directory with proper permissions
        const dirPath = dirname(toLocalPath(properties.Path));
        console.log(`Creating directory: ${dirPath}`);
        mkdirSync(dirPath, { recursive: true, mode: 0o755 });

        // Write file with proper permissions
        console.log(`Writing file: ${toLocalPath(properties.Path)}`);
        writeFileSync(toLocalPath(properties.Path), properties.Contents, { encoding: 'utf-8', mode: 0o644 });
    } catch (error) {
        console.error(`Error creating file: ${error}`);
        throw error;
    }

    // Use a consistent physical resource ID based on file system and path to avoid deletion issues
    const physicalResourceId = (event as any).PhysicalResourceId || `efs-file-${properties.FileSystemId}-${properties.Path.replace(/[^a-zA-Z0-9]/g, '-')}`;
    return {
        PhysicalResourceId: physicalResourceId,
    };
}

export async function deleteObject(event: CdkCustomResourceEvent) {
    const properties = event.ResourceProperties as unknown as IEfsFileResourceProperties;

    if (!properties.FileSystemId) throw new Error('"FileSystemId" is required');
    if (!properties.Contents) throw new Error('"Contents" is required');
    if (!properties.Path) throw new Error('"Path" is required');

    console.log(`Deleting file efs://${properties.FileSystemId}/${properties.Path}`);

    try {
        // Wait for EFS mount to be available with retry logic
        await waitForEfsMountAvailable(properties.FileSystemId, 60000); // 1 minute timeout for delete

        // Delete file if it exists
        const filePath = toLocalPath(properties.Path);
        console.log(`Attempting to delete: ${filePath}`);
        rmSync(filePath, { force: true });
    } catch (error) {
        console.warn(`Warning during file deletion: ${error}`);
        // Don't fail deletion if file doesn't exist or can't be deleted
    }

    // Use the same physical resource ID as creation to avoid conflicts
    return {
        PhysicalResourceId: (event as any).PhysicalResourceId,
    };
}

function toLocalPath(path: string) {
    return join('/mnt', path);
}

/**
 * Wait for EFS mount to be available with exponential backoff
 * @param fileSystemId - The EFS file system ID
 * @param timeoutMs - Maximum time to wait in milliseconds
 */
async function waitForEfsMountAvailable(fileSystemId: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    let attempt = 0;
    const maxAttempts = 20;

    while (Date.now() - startTime < timeoutMs && attempt < maxAttempts) {
        try {
            // Check if the /mnt directory is accessible (mount target is available)
            if (existsSync('/mnt')) {
                console.log(`EFS mount /mnt is available after ${Date.now() - startTime}ms`);
                return;
            }
        } catch (error) {
            console.log(`Attempt ${attempt + 1} - EFS mount not yet available: ${error}`);
        }

        // Exponential backoff: wait 2^attempt seconds, up to 30 seconds
        const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000);
        console.log(`Waiting ${delayMs}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        attempt++;
    }

    if (attempt >= maxAttempts) {
        throw new Error(`EFS mount target not available after ${maxAttempts} attempts over ${Date.now() - startTime}ms`);
    }

    throw new Error(`EFS mount target not available after timeout of ${timeoutMs}ms`);
}
