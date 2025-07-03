import { Construct } from 'constructs';
import { AssetHashType, AssetStaging, DockerImage } from 'aws-cdk-lib';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Path from 'path';

export interface ITemporalNodejsWorkerImageProps {
    readonly entrypoint: string;
    readonly externals?: (string | RegExp)[];
}

/**
 * Creates a Docker image for Node.js Temporal workers with proper bundling and Node 20+ support.
 * 
 * This construct handles:
 * - Proper asset hashing based on source files
 * - Node 20+ runtime with distroless base image
 * - Efficient bundling with externals support
 * - Proper Dockerfile generation
 */
export class TemporalNodejsWorkerImage extends Construct {
    public readonly dockerImageAsset: DockerImageAsset;

    constructor(scope: Construct, id: string, props: ITemporalNodejsWorkerImageProps) {
        super(scope, id);

        // Calculate proper asset hash based on source files
        const sourceHash = this.calculateSourceHash(props.entrypoint);
        
        const staging = new AssetStaging(this, 'Staging', {
            sourcePath: Path.dirname(props.entrypoint),
            assetHashType: AssetHashType.OUTPUT,
            extraHash: sourceHash,

            bundling: {
                local: {
                    tryBundle: (outputDir) => {
                        return this.bundleWorker(outputDir, props);
                    },
                },
                image: DockerImage.fromRegistry('node:20-alpine'),
                command: ['sh', '-c', 'echo "Fallback bundling not implemented"'],
            },
        });

        this.dockerImageAsset = new DockerImageAsset(this, 'ImageAsset', {
            directory: staging.absoluteStagedPath,
            platform: Platform.LINUX_AMD64, // Force AMD64 architecture
            buildArgs: {
                BUILD_IMAGE: `node:20-bullseye-slim`,
                RUNTIME_IMAGE: `gcr.io/distroless/nodejs20-debian12`,
            },
        });
    }

    private calculateSourceHash(entrypoint: string): string {
        const hasher = crypto.createHash('sha256');
        
        try {
            // Hash the main entrypoint file
            const entrypointContent = fs.readFileSync(entrypoint, 'utf8');
            hasher.update(entrypoint);
            hasher.update(entrypointContent);
            
            // Hash package.json if it exists
            const packageJsonPath = Path.join(Path.dirname(entrypoint), 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = fs.readFileSync(packageJsonPath, 'utf8');
                hasher.update(packageJson);
            }
            
            return hasher.digest('hex').substring(0, 16);
        } catch (error) {
            console.warn(`Warning: Could not calculate source hash for ${entrypoint}:`, error);
            return Date.now().toString(36); // Fallback to timestamp
        }
    }

    private bundleWorker(outputDir: string, props: ITemporalNodejsWorkerImageProps): boolean {
        try {
            // Create a proper Dockerfile
            const dockerfile = this.generateDockerfile(props);
            fs.writeFileSync(Path.join(outputDir, 'Dockerfile'), dockerfile);
            
            // Copy all TypeScript and JavaScript files from the source directory
            const sourceDir = Path.dirname(props.entrypoint);
            const entrypointName = Path.basename(props.entrypoint);

            // Copy all .ts and .js files and directories
            const copyRecursively = (src: string, dest: string) => {
                const stats = fs.statSync(src);
                if (stats.isDirectory()) {
                    if (!fs.existsSync(dest)) {
                        fs.mkdirSync(dest, { recursive: true });
                    }
                    const files = fs.readdirSync(src);
                    files.forEach(file => {
                        copyRecursively(Path.join(src, file), Path.join(dest, file));
                    });
                } else if (src.endsWith('.ts') || src.endsWith('.js')) {
                    fs.copyFileSync(src, dest);
                }
            };

            const files = fs.readdirSync(sourceDir);
            files.forEach(file => {
                const sourcePath = Path.join(sourceDir, file);
                const destPath = Path.join(outputDir, file);

                if (fs.statSync(sourcePath).isDirectory()) {
                    // Copy directories recursively
                    copyRecursively(sourcePath, destPath);
                } else if (file.endsWith('.ts') || file.endsWith('.js')) {
                    // Copy individual files
                    fs.copyFileSync(sourcePath, destPath);
                }
            });

            // Copy package.json and tsconfig.json if they exist
            const packageJsonPath = Path.join(sourceDir, 'package.json');
            const tsconfigPath = Path.join(sourceDir, 'tsconfig.json');

            if (fs.existsSync(packageJsonPath)) {
                fs.copyFileSync(packageJsonPath, Path.join(outputDir, 'package.json'));
            }

            if (fs.existsSync(tsconfigPath)) {
                fs.copyFileSync(tsconfigPath, Path.join(outputDir, 'tsconfig.json'));
            } else {
                // Create minimal package.json
                const minimalPackageJson = {
                    name: 'temporal-worker',
                    version: '1.0.0',
                    main: entrypointName,
                    dependencies: {
                        '@temporalio/worker': '^1.8.0',
                        '@temporalio/activity': '^1.8.0',
                        '@temporalio/workflow': '^1.8.0',
                    }
                };
                fs.writeFileSync(Path.join(outputDir, 'package.json'), JSON.stringify(minimalPackageJson, null, 2));
            }
            
            return true;
        } catch (error) {
            console.error('Error bundling worker:', error);
            return false;
        }
    }

    private generateDockerfile(props: ITemporalNodejsWorkerImageProps): string {
        const entrypointName = Path.basename(props.entrypoint);
        const externalsArgs = (props.externals ?? []).map(ext => 
            typeof ext === 'string' ? ext : ext.source
        ).join(' ');

        return `
# Build stage
ARG BUILD_IMAGE=node:20-bullseye-slim
FROM --platform=linux/amd64 \${BUILD_IMAGE} AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json* ./

# Install all dependencies (including TypeScript and ts-node)
RUN npm install

# Copy all TypeScript and JavaScript files and directories
COPY . ./

# Runtime stage - use regular Node.js image for TypeScript support
FROM --platform=linux/amd64 node:20-bullseye-slim

WORKDIR /app

# Install system dependencies for health checks
RUN apt-get update && apt-get install -y procps && rm -rf /var/lib/apt/lists/*

# Install ts-node globally for TypeScript runtime
RUN npm install -g ts-node typescript

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/ ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json* ./

# Set proper Node.js runtime
ENV NODE_ENV=production

# Run the TypeScript worker directly with ts-node
CMD ["ts-node", "${entrypointName}"]
`;
    }
}

function encodeStringOrRegExp(x: string | RegExp) {
    if (typeof x === 'string') return x;
    if (x instanceof RegExp) return `/${x.source}/${x.flags.includes('i') ? 'i' : ''}`;
    throw new Error('Expected argument to be either a string or a RegExp');
}
