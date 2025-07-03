import { Construct } from 'constructs';
import { AssetHashType, AssetStaging, DockerImage } from 'aws-cdk-lib';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as fs from 'fs';
import * as crypto from 'crypto';
import Path from 'path';

export interface ITemporalPythonWorkerImageProps {
    readonly entrypoint: string;
    readonly requirements?: string;
    readonly pythonVersion?: string;
}

/**
 * Creates a Docker image for Python Temporal workers with proper dependency management.
 * 
 * This construct handles:
 * - Proper asset hashing based on source files
 * - Python 3.11+ runtime with slim base image
 * - Efficient dependency installation with pip
 * - Proper Dockerfile generation
 * - Multi-stage builds for smaller images
 */
export class TemporalPythonWorkerImage extends Construct {
    public readonly dockerImageAsset: DockerImageAsset;

    constructor(scope: Construct, id: string, props: ITemporalPythonWorkerImageProps) {
        super(scope, id);

        // Calculate proper asset hash based on source files
        const sourceHash = this.calculateSourceHash(props.entrypoint, props.requirements);
        
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
                image: DockerImage.fromRegistry(`python:${props.pythonVersion || '3.11'}-slim`),
                command: ['sh', '-c', 'echo "Fallback bundling not implemented"'],
            },
        });

        this.dockerImageAsset = new DockerImageAsset(this, 'ImageAsset', {
            directory: staging.absoluteStagedPath,
            platform: Platform.LINUX_AMD64, // Force AMD64 architecture
            buildArgs: {
                PYTHON_VERSION: props.pythonVersion || '3.11',
                BUILD_IMAGE: `python:${props.pythonVersion || '3.11'}-slim`,
                RUNTIME_IMAGE: `python:${props.pythonVersion || '3.11'}-slim`,
            },
        });
    }

    private calculateSourceHash(entrypoint: string, requirements?: string): string {
        const hasher = crypto.createHash('sha256');
        
        try {
            // Hash the main entrypoint file
            const entrypointContent = fs.readFileSync(entrypoint, 'utf8');
            hasher.update(entrypoint);
            hasher.update(entrypointContent);
            
            // Hash requirements.txt if it exists
            if (requirements && fs.existsSync(requirements)) {
                const requirementsContent = fs.readFileSync(requirements, 'utf8');
                hasher.update(requirementsContent);
            }
            
            // Hash all Python files in the directory
            const entrypointDir = Path.dirname(entrypoint);
            const pythonFiles = fs.readdirSync(entrypointDir)
                .filter(file => file.endsWith('.py'))
                .sort();
            
            for (const file of pythonFiles) {
                const filePath = Path.join(entrypointDir, file);
                const content = fs.readFileSync(filePath, 'utf8');
                hasher.update(file);
                hasher.update(content);
            }
            
            return hasher.digest('hex').substring(0, 16);
        } catch (error) {
            console.warn(`Warning: Could not calculate source hash for ${entrypoint}:`, error);
            return Date.now().toString(36); // Fallback to timestamp
        }
    }

    private bundleWorker(outputDir: string, props: ITemporalPythonWorkerImageProps): boolean {
        try {
            // Create a proper Dockerfile
            const dockerfile = this.generateDockerfile(props);
            fs.writeFileSync(Path.join(outputDir, 'Dockerfile'), dockerfile);
            
            // Copy all Python files from the worker directory
            const entrypointDir = Path.dirname(props.entrypoint);
            const pythonFiles = fs.readdirSync(entrypointDir)
                .filter(file => file.endsWith('.py'));
            
            for (const file of pythonFiles) {
                const sourcePath = Path.join(entrypointDir, file);
                const destPath = Path.join(outputDir, file);
                fs.copyFileSync(sourcePath, destPath);
            }
            
            // Copy requirements.txt if it exists
            if (props.requirements && fs.existsSync(props.requirements)) {
                fs.copyFileSync(props.requirements, Path.join(outputDir, 'requirements.txt'));
            } else {
                // Create minimal requirements.txt
                const minimalRequirements = `# Temporal SDK
temporalio>=1.7.0

# Basic dependencies
aiofiles>=23.0.0
structlog>=23.0.0
`;
                fs.writeFileSync(Path.join(outputDir, 'requirements.txt'), minimalRequirements);
            }
            
            return true;
        } catch (error) {
            console.error('Error bundling Python worker:', error);
            return false;
        }
    }

    private generateDockerfile(props: ITemporalPythonWorkerImageProps): string {
        const entrypointName = Path.basename(props.entrypoint);
        const pythonVersion = props.pythonVersion || '3.11';

        return `
# Build stage
ARG BUILD_IMAGE=python:${pythonVersion}-slim
FROM --platform=linux/amd64 \${BUILD_IMAGE} AS builder

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY *.py ./

# Runtime stage
ARG RUNTIME_IMAGE=python:${pythonVersion}-slim
FROM --platform=linux/amd64 \${RUNTIME_IMAGE}

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

WORKDIR /app

# Create non-root user
RUN groupadd -r temporal && useradd -r -g temporal temporal

# Copy from builder
COPY --from=builder /usr/local/lib/python${pythonVersion}/site-packages /usr/local/lib/python${pythonVersion}/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /app/*.py ./

# Change ownership to temporal user
RUN chown -R temporal:temporal /app

# Switch to non-root user
USER temporal

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \\
    CMD pgrep -f python || exit 1

# Run the worker
CMD ["python", "${entrypointName}"]
`;
    }
}
