import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { TemporalCluster, TemporalVersion, AuroraTemporalDatastore, TemporalNamespace } from './dist';
import { Vpc, Subnet, SecurityGroup, InstanceType, InstanceClass, InstanceSize } from 'aws-cdk-lib/aws-ec2';

import { Cluster, CpuArchitecture } from 'aws-cdk-lib/aws-ecs';
import { PrivateDnsNamespace } from 'aws-cdk-lib/aws-servicediscovery';
import { DatabaseClusterEngine, AuroraPostgresEngineVersion } from 'aws-cdk-lib/aws-rds';

const app = new App();

// Example for development environment

const stackName = 'TemporalCluster-Dev';
const stack = new Stack(app, stackName, {
    env: {
        region: 'us-west-2',
        account: '123456789012', // Replace with your AWS account ID
    },
});

// Import your existing VPC using the VPC ID
const vpc = Vpc.fromLookup(stack, 'ExistingVpc', {
    vpcId: 'vpc-xxxxxxxx', // Replace with your VPC ID
});

// Import security groups
const vpnSecurityGroup = SecurityGroup.fromSecurityGroupId(stack, 'VpnSecurityGroup', 'sg-xxxxxxxx');
const webSecurityGroup = SecurityGroup.fromSecurityGroupId(stack, 'WebSecurityGroup', 'sg-yyyyyyyy');

// Import your existing ECS cluster
const ecsCluster = Cluster.fromClusterAttributes(stack, 'ExistingEcsCluster', {
    clusterName: 'your-cluster-name',
    clusterArn: 'arn:aws:ecs:us-west-2:123456789012:cluster/your-cluster-name',
    vpc: vpc,
    securityGroups: [vpnSecurityGroup, webSecurityGroup], // Security groups with VPC endpoint access
});

// Create a CloudMap namespace for Temporal service discovery - separate from existing DNS
// This is purely for internal service-to-service discovery, not external routing
const cloudMapNamespace = new PrivateDnsNamespace(stack, 'TemporalNamespace', {
    name: 'temporal-cluster.local',
    vpc: vpc,
});

// Apply RemovalPolicy.DESTROY to CloudMap namespace for easy cleanup
cloudMapNamespace.applyRemovalPolicy(RemovalPolicy.DESTROY);

// Create Aurora PostgreSQL cluster with ARM instances (compatible with Temporal 1.28)
const datastore = new AuroraTemporalDatastore(stack, 'TemporalDatastore', {
    engine: DatabaseClusterEngine.auroraPostgres({ version: AuroraPostgresEngineVersion.VER_15_3 }),
    vpc: vpc,
    vpcSubnets: {
        // Use your existing database subnets
        subnets: [
            Subnet.fromSubnetAttributes(stack, 'DbSubnet2a', {
                subnetId: 'subnet-xxxxxxxx', // Your database subnet in AZ a
                availabilityZone: 'us-west-2a',
                routeTableId: 'rtb-xxxxxxxx'
            }),
            Subnet.fromSubnetAttributes(stack, 'DbSubnet2b', {
                subnetId: 'subnet-yyyyyyyy', // Your database subnet in AZ b
                availabilityZone: 'us-west-2b',
                routeTableId: 'rtb-yyyyyyyy'
            }),
        ]
    },
    instanceType: InstanceType.of(InstanceClass.T4G, InstanceSize.MEDIUM), // ARM-based Graviton2 medium instance
    removalPolicy: RemovalPolicy.DESTROY,
});

// Service subnets are now configured individually in each service

// Create the Temporal cluster using your existing ECS cluster with ECR images
const temporalCluster = new TemporalCluster(stack, 'TemporalCluster', {
    vpc,
    ecsCluster, // Use your existing ECS cluster
    datastore, // Use Aurora Serverless v2 instead of deprecated v1
    temporalVersion: TemporalVersion.V1_28.withCustomizations({
        repositoryBase: '123456789012.dkr.ecr.us-west-2.amazonaws.com/', // Replace with your ECR registry
        imageNames: {
            temporalServer: 'temporal/server',
            temporalAdminTools: 'temporal/admin-tools',
            temporalUI: 'temporal/ui'
        }
    }), // Use ECR images version 1.28
    cloudMapRegistration: {
        namespace: cloudMapNamespace,
        serviceName: 'temporal',
    },
    // Configure all services to use your custom Dev environment subnets
    services: {
        defaults: {
            machine: {
                cpu: 512,
                memoryLimitMiB: 1024,
                cpuArchitecture: CpuArchitecture.X86_64,
            },
            // customSubnets configured individually in each service
        },
        // Frontend service needs extra resources as it's the main entry point
        frontend: {
            machine: {
                cpu: 1024,
                memoryLimitMiB: 2048,
                cpuArchitecture: CpuArchitecture.X86_64,
            }
        },
        // Web service for Temporal UI
        web: {
            enabled: true,
            machine: {
                cpu: 512,
                memoryLimitMiB: 1024,
                cpuArchitecture: CpuArchitecture.X86_64,
            }
        }
    },
    removalPolicy: RemovalPolicy.DESTROY, // Use DESTROY for dev environment
});

// ECR permissions are now automatically added in BaseService for custom repositories

// For development, you might want to allow broader access
// Uncomment these lines if you need external access:
// temporalCluster.connections.allowDefaultPortFromAnyIpv4();
// temporalCluster.rolesConnections.web.allowDefaultPortFromAnyIpv4();

console.log(`Temporal cluster will be deployed to: ${temporalCluster.host}`);

// Create the default namespace that the Web UI expects
// This will be created after the Temporal cluster is running
const defaultNamespace = new TemporalNamespace(temporalCluster, 'default');

app.synth();
