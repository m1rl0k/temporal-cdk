import { Construct } from 'constructs';
import { AssetHashType, AssetStaging, DockerImage } from 'aws-cdk-lib';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Path from 'path';

export interface TemporalGoWorkerImageProps {
    /**
     * The path to the Go worker directory
     * @default '../temporal-workers/go-worker'
     */
    readonly entrypoint?: string;

    /**
     * The platform to build for
     * @default Platform.LINUX_AMD64
     */
    readonly platform?: Platform;

    /**
     * Additional build arguments
     */
    readonly buildArgs?: { [key: string]: string };

    /**
     * Go version to use
     * @default '1.21'
     */
    readonly goVersion?: string;
}

/**
 * Creates a Docker image for Go Temporal workers with proper module management.
 *
 * This construct handles:
 * - Proper asset hashing based on source files
 * - Go 1.21+ runtime with Alpine base image
 * - Efficient module caching and building
 * - Multi-stage builds for minimal images
 * - Static binary compilation
 */
export class TemporalGoWorkerImage extends Construct {
    public readonly dockerImageAsset: DockerImageAsset;

    constructor(scope: Construct, id: string, props: TemporalGoWorkerImageProps = {}) {
        super(scope, id);

        const entrypoint = props.entrypoint || './temporal-workers/go-worker';

        // Calculate proper asset hash based on source files
        const sourceHash = this.calculateSourceHash(entrypoint);

        const staging = new AssetStaging(this, 'Staging', {
            sourcePath: entrypoint,
            assetHashType: AssetHashType.OUTPUT,
            extraHash: sourceHash,

            bundling: {
                local: {
                    tryBundle: (outputDir) => {
                        return this.bundleWorker(outputDir, entrypoint);
                    },
                },
                image: DockerImage.fromRegistry(`golang:${props.goVersion || '1.21'}-alpine`),
                command: ['sh', '-c', 'echo "Fallback bundling not implemented"'],
            },
        });

        this.dockerImageAsset = new DockerImageAsset(this, 'ImageAsset', {
            directory: staging.absoluteStagedPath,
            platform: props.platform || Platform.LINUX_AMD64,
            buildArgs: {
                GO_VERSION: props.goVersion || '1.21',
                BUILD_IMAGE: `golang:${props.goVersion || '1.21'}-alpine`,
                RUNTIME_IMAGE: 'alpine:latest',
                CGO_ENABLED: '0',
                GOOS: 'linux',
                GOARCH: 'amd64',
                ...props.buildArgs,
            },
        });
    }

    private calculateSourceHash(entrypoint: string): string {
        const hasher = crypto.createHash('sha256');

        try {
            const resolvedPath = entrypoint;

            // Hash go.mod and go.sum
            const goModPath = Path.join(resolvedPath, 'go.mod');
            const goSumPath = Path.join(resolvedPath, 'go.sum');

            if (fs.existsSync(goModPath)) {
                const goModContent = fs.readFileSync(goModPath, 'utf8');
                hasher.update(goModContent);
            }

            if (fs.existsSync(goSumPath)) {
                const goSumContent = fs.readFileSync(goSumPath, 'utf8');
                hasher.update(goSumContent);
            }

            // Hash all Go files
            const goFiles = this.findGoFiles(resolvedPath);
            goFiles.sort();

            for (const file of goFiles) {
                const content = fs.readFileSync(file, 'utf8');
                hasher.update(Path.relative(resolvedPath, file));
                hasher.update(content);
            }

            return hasher.digest('hex').substring(0, 16);
        } catch (error) {
            console.warn(`Warning: Could not calculate source hash for ${entrypoint}:`, error);
            return Date.now().toString(36);
        }
    }

    private findGoFiles(dir: string): string[] {
        const goFiles: string[] = [];

        if (!fs.existsSync(dir)) return goFiles;

        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = Path.join(dir, item.name);

            if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'vendor') {
                goFiles.push(...this.findGoFiles(fullPath));
            } else if (item.isFile() && item.name.endsWith('.go')) {
                goFiles.push(fullPath);
            }
        }

        return goFiles;
    }

    private bundleWorker(outputDir: string, entrypoint: string): boolean {
        try {
            const resolvedPath = entrypoint;

            // Create Dockerfile
            const dockerfile = this.generateDockerfile();
            fs.writeFileSync(Path.join(outputDir, 'Dockerfile'), dockerfile);

            // Copy all Go source files
            this.copyGoFiles(resolvedPath, outputDir);

            // Copy go.mod and go.sum
            const goModPath = Path.join(resolvedPath, 'go.mod');
            const goSumPath = Path.join(resolvedPath, 'go.sum');

            if (fs.existsSync(goModPath)) {
                fs.copyFileSync(goModPath, Path.join(outputDir, 'go.mod'));
            }

            if (fs.existsSync(goSumPath)) {
                fs.copyFileSync(goSumPath, Path.join(outputDir, 'go.sum'));
            }

            return true;
        } catch (error) {
            console.error('Error bundling Go worker:', error);
            return false;
        }
    }

    private copyGoFiles(sourceDir: string, outputDir: string): void {
        if (!fs.existsSync(sourceDir)) return;

        const items = fs.readdirSync(sourceDir, { withFileTypes: true });

        for (const item of items) {
            const sourcePath = Path.join(sourceDir, item.name);
            const destPath = Path.join(outputDir, item.name);

            if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'vendor') {
                fs.mkdirSync(destPath, { recursive: true });
                this.copyGoFiles(sourcePath, destPath);
            } else if (item.isFile() && item.name.endsWith('.go')) {
                fs.copyFileSync(sourcePath, destPath);
            }
        }
    }

    private generateDockerfile(): string {
        return `
# Build stage
ARG BUILD_IMAGE=golang:1.21-alpine
FROM \${BUILD_IMAGE} AS builder

# Install git and ca-certificates
RUN apk add --no-cache git ca-certificates

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
ARG CGO_ENABLED=0
ARG GOOS=linux
ARG GOARCH=amd64
RUN CGO_ENABLED=\${CGO_ENABLED} GOOS=\${GOOS} GOARCH=\${GOARCH} \\
    go build -a -installsuffix cgo -ldflags '-extldflags "-static"' -o worker .

# Runtime stage
ARG RUNTIME_IMAGE=alpine:latest
FROM \${RUNTIME_IMAGE}

# Install ca-certificates for HTTPS connections
RUN apk --no-cache add ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S temporal && \\
    adduser -u 1001 -S temporal -G temporal

# Set working directory
WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/worker .

# Change ownership to temporal user
RUN chown -R temporal:temporal /app

# Switch to non-root user
USER temporal

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
    CMD pgrep worker || exit 1

# Set default command
CMD ["./worker", "worker"]
`;
    }

    /**
     * Get the image URI for use in ECS task definitions
     */
    public get imageUri(): string {
        return this.dockerImageAsset.imageUri;
    }

    /**
     * Get the repository for use in ECS task definitions
     */
    public get repository() {
        return this.dockerImageAsset.repository;
    }
}
