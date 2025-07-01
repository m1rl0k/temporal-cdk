import {
    AwsLogDriver,
    ContainerImage,
    CpuArchitecture,
    FargatePlatformVersion,
    FargateService,
    FargateTaskDefinition,
    OperatingSystemFamily,
    Protocol,
    Secret,
    CfnService,
    IFargateService,
} from 'aws-cdk-lib/aws-ecs';
import { IFileSystem, IAccessPoint } from 'aws-cdk-lib/aws-efs';
import { Repository } from 'aws-cdk-lib/aws-ecr';
import { Connections, IConnectable, SubnetType, Subnet, SecurityGroup, ISecurityGroup, Port } from 'aws-cdk-lib/aws-ec2';
import { ApplicationLoadBalancer, ApplicationTargetGroup, Protocol as ElbProtocol, HealthCheck } from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { TemporalCluster } from '..';
import { uniq, map } from 'lodash';
import { DockerImage, RemovalPolicy } from 'aws-cdk-lib';
import { PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';

export interface ITemporalServiceMachineProps {
    readonly cpu: number;
    readonly memoryLimitMiB: number;
    readonly cpuArchitecture: CpuArchitecture;
}

export interface ITemporalServiceVolumeProps {
    name: string;
    fileSystem: IFileSystem;
    volumePath: string;
    containerPath: string;
    readOnly: boolean;
    accessPoint?: IAccessPoint;
}

export interface IBaseTemporalServiceProps {
    readonly image: DockerImage;
    readonly machine: ITemporalServiceMachineProps;
    readonly environment: { [key: string]: string };
    readonly secrets?: { [key: string]: Secret };
    readonly volumes: ITemporalServiceVolumeProps[];
    readonly exposedPorts: number[];
    readonly customSubnets?: string[]; // Optional custom subnet IDs
    readonly securityGroups?: ISecurityGroup[]; // Optional security groups
}

export abstract class BaseTemporalService extends Construct implements IConnectable {
    public readonly fargateServiceConnections: Connections;
    private readonly taskDefinition: FargateTaskDefinition;
    public readonly cfnService: CfnService;

    constructor(private cluster: TemporalCluster, id: string, props: IBaseTemporalServiceProps) {
        super(cluster, id);

        this.taskDefinition = new FargateTaskDefinition(this, `TaskDef`, {
            cpu: props.machine.cpu,
            memoryLimitMiB: props.machine.memoryLimitMiB,
            runtimePlatform: {
                cpuArchitecture: props.machine.cpuArchitecture,
                operatingSystemFamily: OperatingSystemFamily.LINUX,
            },

            volumes: props.volumes.map((vol) => ({
                name: vol.name,
                efsVolumeConfiguration: {
                    fileSystemId: vol.fileSystem.fileSystemId,
                    // When using access point, rootDirectory must be "/" or omitted
                    rootDirectory: vol.accessPoint ? "/" : vol.volumePath,
                    transitEncryption: 'ENABLED',
                    authorizationConfig: {
                        accessPointId: vol.accessPoint?.accessPointId,
                        iam: 'ENABLED',
                    },
                },
            })),
        });

        // Determine if this is an ECR image and create appropriate ContainerImage
        const containerImage = this.createContainerImage(props.image.image);

        const container = this.taskDefinition.addContainer(`${cluster.name}-${id}`, {
            containerName: `${cluster.name}-${id}`,
            image: containerImage,

            environment: props.environment,
            secrets: props.secrets,
            
            // Critical: Temporal services need write access for temporary files and dynamic config
            // See: https://community.temporal.io/t/deploying-to-ecs-fargate/1313
            // ReadOnly root filesystem must be disabled for proper operation
            readonlyRootFilesystem: false,

            logging: new AwsLogDriver({
                streamPrefix: `${this.cluster.name}-${id}`,
                logGroup: new LogGroup(this, `LogGroup`, {
                    removalPolicy: RemovalPolicy.DESTROY, // Use DESTROY for dev, RETAIN for prod
                    retention: RetentionDays.ONE_WEEK, // Appropriate for development
                }),
            }),

            portMappings: props.exposedPorts.map((port: number) => ({
                containerPort: port,
                hostPort: port,
                protocol: Protocol.TCP,
            })),
        });

        container.addMountPoints(
            ...props.volumes.map((vol) => ({
                sourceVolume: vol.name,
                containerPath: vol.containerPath,
                readOnly: vol.readOnly,
            })),
        );

        // Configure subnets - use custom subnets if provided, otherwise use default
        const vpcSubnets = props.customSubnets
            ? { subnets: props.customSubnets.map(subnetId => {
                // For specific subnet configurations, you may need to provide subnet attributes
                // This is an example for a specific subnet - update with your subnet details
                if (subnetId === 'subnet-46f62e30') {
                    return Subnet.fromSubnetAttributes(this, `CustomSubnet${subnetId.slice(-8)}`, {
                        subnetId: subnetId,
                        availabilityZone: 'us-west-2a',
                        routeTableId: 'rtb-07bf02ab5a6ec3f2e'
                    });
                }
                // Fallback for other subnets
                return Subnet.fromSubnetId(this, `CustomSubnet${subnetId.slice(-8)}`, subnetId);
            }) }
            : { onePerAz: true, subnetType: SubnetType.PRIVATE_WITH_NAT };

        // Determine which subnets to use
        const subnetIds = props.customSubnets || [vpcSubnets.subnets?.[0]?.subnetId].filter(Boolean);

        // Use only the provided security groups (they already have VPC endpoint access)
        const securityGroupIds = props.securityGroups?.map(sg => sg.securityGroupId) || [
            'sg-xxxxxxxx', // Your VPN security group (should have VPC endpoint access)
            'sg-yyyyyyyy', // Your web security group (should have VPC endpoint access)
        ];

        // Create CfnService directly for full control (like dc.yml template)
        this.cfnService = new CfnService(this, `CfnService`, {
            cluster: cluster.ecsCluster.clusterArn,
            taskDefinition: this.taskDefinition.taskDefinitionArn,
            launchType: 'FARGATE',
            platformVersion: '1.4.0',

            // Configure deployment settings
            deploymentConfiguration: {
                minimumHealthyPercent: 100,
                maximumPercent: 200,
            },

            // Enable 'aws ecs exec' to this container
            enableExecuteCommand: true,

            // Network configuration with explicit security groups (like dc.yml)
            networkConfiguration: {
                awsvpcConfiguration: {
                    assignPublicIp: 'DISABLED',
                    subnets: subnetIds,
                    securityGroups: securityGroupIds,
                },
            },
        });

        // Create a minimal connections object for compatibility
        this.fargateServiceConnections = new Connections({
            securityGroups: props.securityGroups || [],
        });

        // Grant ECR permissions for pulling Docker images
        this.grantEcrPermissions();

        // Security groups already have VPC endpoint access, no need for additional connections

        // Grant network access from the connections object to the EFS file system
        for (const fs of uniq(map(props.volumes, 'fileSystem'))) {
            fs.connections.allowDefaultPortFrom(this.fargateServiceConnections);
        }
    }

    public get connections(): Connections {
        return this.fargateServiceConnections;
    }

    public get temporalCluster(): TemporalCluster {
        return this.cluster;
    }

    private createContainerImage(imageUri: string): ContainerImage {
        // Check if this is an ECR image URI
        if (imageUri.includes('.amazonaws.com/')) {
            // Extract repository name from ECR URI
            // Example: 202942626335.dkr.ecr.us-west-2.amazonaws.com/temporal/server:1.28
            // Extract: temporal/server
            const parts = imageUri.split('/');
            const repositoryName = parts.slice(1).join('/').split(':')[0]; // Get everything after domain, remove tag
            
            // Import the ECR repository and create container image
            const repository = Repository.fromRepositoryName(this, `EcrRepo-${repositoryName.replace('/', '-')}`, repositoryName);
            return ContainerImage.fromEcrRepository(repository, imageUri.includes(':') ? imageUri.split(':').pop() : 'latest');
        } else {
            // For non-ECR images, use the standard registry method
            return ContainerImage.fromRegistry(imageUri);
        }
    }

    private grantEcrPermissions(): void {
        // ECR permissions are now automatically granted by ContainerImage.fromEcrRepository()
        // This method is kept for compatibility but no longer needed for ECR images
    }
}
