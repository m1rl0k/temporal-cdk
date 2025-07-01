"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const aws_cdk_lib_1 = require("aws-cdk-lib");
const lib_1 = require("./dist");
const aws_ec2_1 = require("aws-cdk-lib/aws-ec2");
const aws_ecs_1 = require("aws-cdk-lib/aws-ecs");
const aws_servicediscovery_1 = require("aws-cdk-lib/aws-servicediscovery");
const aws_rds_1 = require("aws-cdk-lib/aws-rds");
const app = new aws_cdk_lib_1.App();
// Example for development environment
const environment = 'Dev';
const stack = new aws_cdk_lib_1.Stack(app, `TemporalCluster-${environment}`, {
    env: {
        region: 'us-west-2',
        account: '123456789012', // Replace with your AWS account ID
    },
});
// Import your existing VPC using the VPC ID
const vpc = aws_ec2_1.Vpc.fromLookup(stack, 'ExistingVpc', {
    vpcId: 'vpc-xxxxxxxx', // Replace with your VPC ID
});
// Import your existing ECS cluster
const ecsCluster = aws_ecs_1.Cluster.fromClusterAttributes(stack, 'ExistingEcsCluster', {
    clusterName: 'your-cluster-name',
    clusterArn: 'arn:aws:ecs:us-west-2:123456789012:cluster/your-cluster-name',
    vpc: vpc,
    securityGroups: [], // Add your security groups if needed
});
// Create a CloudMap namespace for Temporal service discovery
const cloudMapNamespace = new aws_servicediscovery_1.PrivateDnsNamespace(stack, 'TemporalNamespace', {
    name: 'temporal-dev.services-internal.your-domain.com',
    vpc: vpc,
});
// Create Aurora Serverless datastore
const datastore = new lib_1.AuroraServerlessTemporalDatastore(stack, 'TemporalDatastore', {
    engine: aws_rds_1.DatabaseClusterEngine.auroraMysql({ version: aws_rds_1.AuroraMysqlEngineVersion.VER_3_07_0 }),
    vpc: vpc,
    vpcSubnets: {
        // Use your existing database subnets
        subnets: [
            aws_ec2_1.Subnet.fromSubnetId(stack, 'DbSubnet2a', 'subnet-xxxxxxxx'), // Your database subnet in AZ a
            aws_ec2_1.Subnet.fromSubnetId(stack, 'DbSubnet2b', 'subnet-yyyyyyyy'), // Your database subnet in AZ b
        ]
    },
    serverlessV2MinCapacity: 0.5, // Minimum capacity units
    serverlessV2MaxCapacity: 2, // Maximum capacity units for dev
    removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY,
});
// Service subnets are now configured individually in each service
// Create the Temporal cluster using your existing ECS cluster with ECR images
const temporalCluster = new lib_1.TemporalCluster(stack, 'TemporalCluster', {
    vpc,
    ecsCluster, // Use your existing ECS cluster
    datastore, // Use Aurora Serverless v2 instead of deprecated v1
    temporalVersion: lib_1.TemporalVersion.V1_28.withCustomizations({
        repositoryBase: '123456789012.dkr.ecr.us-west-2.amazonaws.com/', // Replace with your ECR registry
        imageNames: {
            temporalServer: 'temporal/server',
            temporalAdminTools: 'temporal/admin-tools',
            temporalUI: 'temporal/ui'
        }
    }), // Use ECR images version 1.28 with correct AMD64 architecture
    cloudMapRegistration: {
        namespace: cloudMapNamespace,
        serviceName: 'temporal',
    },
    // Configure all services to use your custom Dev environment subnets
    services: {
        defaults: {
            machine: {
                cpu: 256,
                memoryLimitMiB: 512,
                cpuArchitecture: aws_ecs_1.CpuArchitecture.X86_64,
            },
            // customSubnets configured individually in each service
        }
    },
    removalPolicy: aws_cdk_lib_1.RemovalPolicy.DESTROY, // Use DESTROY for dev environment
});
// ECR permissions are now automatically added in BaseService for custom repositories
// For development, you might want to allow broader access
// Uncomment these lines if you need external access:
// temporalCluster.connections.allowDefaultPortFromAnyIpv4();
// temporalCluster.rolesConnections.web.allowDefaultPortFromAnyIpv4();
console.log(`Temporal cluster will be deployed to: ${temporalCluster.host}`);
app.synth();
