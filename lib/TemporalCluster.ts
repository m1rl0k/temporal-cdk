import { Construct } from 'constructs';
import { Connections, IConnectable, IVpc, Port, SecurityGroup, ISecurityGroup, Subnet, InterfaceVpcEndpoint, InterfaceVpcEndpointAwsService } from 'aws-cdk-lib/aws-ec2';
import { CfnFileSystem, CfnMountTarget, CfnAccessPoint, AccessPoint, FileSystem, IFileSystem, IAccessPoint } from 'aws-cdk-lib/aws-efs';
import { AuroraPostgresEngineVersion, DatabaseClusterEngine } from 'aws-cdk-lib/aws-rds';
import { Cluster, CpuArchitecture, ICluster } from 'aws-cdk-lib/aws-ecs';
import {
    AuroraServerlessTemporalDatastore,
    IAuroraServerlessTemporalDatastoreProps,
    ITemporalDatastore,
} from './TemporalDatastore';
import { TemporalVersion } from './TemporalVersion';
import { Annotations, Lazy, Names, RemovalPolicy, Duration } from 'aws-cdk-lib';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import { EfsFile } from './customResources/efsFileResource/EfsFileResource';
import { TemporalConfiguration } from './configurations/TemporalConfiguration';
import { INamespace } from 'aws-cdk-lib/aws-servicediscovery';
import {
    SingleService,
    FrontendService,
    HistoryService,
    MatchingService,
    WebService,
    WorkerService,
} from './services/ServerServices';
import { ITemporalServiceMachineProps } from './services/BaseService';
import { TemporalDatabase } from './customResources/temporal/TemporalDatabase';
import { TemporalWebLoadBalancer } from './services/TemporalWebLoadBalancer';

export interface ITemporalClusterProps {
    readonly clusterName?: string;
    readonly temporalVersion?: TemporalVersion;

    readonly vpc: IVpc;
    readonly ecsCluster?: ICluster;

    readonly removalPolicy?: RemovalPolicy;

    readonly datastore?: ITemporalDatastore;
    readonly datastoreOptions?: Omit<IAuroraServerlessTemporalDatastoreProps, 'vpc' | 'engine'>;

    readonly services?: {
        single?: Partial<ITemporalServiceProps>;

        frontend?: Partial<ITemporalServiceProps>;
        history?: Partial<ITemporalServiceProps>;
        matching?: Partial<ITemporalServiceProps>;
        worker?: Partial<ITemporalServiceProps>;

        web?: Partial<ITemporalServiceProps> & { enabled?: boolean };

        defaults?: Partial<ITemporalServiceProps>;
    };

    readonly cloudMapRegistration?: {
        namespace: INamespace;
        serviceName: string;
    };

    // FIXME: Implements this
    readonly metrics?: {
        engine?: 'disabled' | 'prometheus' | 'cloudwatch';
        prometheusServer?: string;
    };
}

interface ITemporalServiceProps {
    machine: ITemporalServiceMachineProps;
}

const defaultMachineProperties: ITemporalServiceMachineProps = {
    cpu: 256,
    memoryLimitMiB: 512,
    cpuArchitecture: CpuArchitecture.X86_64,
} as const;

type TemporalNodeType = 'single' | 'frontend' | 'matching' | 'history' | 'worker' | 'web';

export class TemporalCluster extends Construct implements IConnectable {
    public readonly name: string;
    public readonly host: string;

    public readonly temporalVersion: TemporalVersion;

    // FIXME: Reconsider if it would be possible to not expose the following three publicly
    public readonly temporalConfig: TemporalConfiguration;
    public readonly ecsCluster: ICluster;
    public readonly configEfs: IFileSystem;
    public configEfsAccessPoint: IAccessPoint;
    public vpnSecurityGroup: ISecurityGroup;

    public readonly services: {
        single?: SingleService;
        frontend?: FrontendService;
        matching?: MatchingService;
        history?: HistoryService;
        worker?: WorkerService;
        web?: WebService;
    };

    public rolesConnections: {
        frontend: Connections;
        matching: Connections;
        history: Connections;
        worker: Connections;
        web: Connections;
    };

    constructor(scope: Construct, id: string, clusterProps: ITemporalClusterProps) {
        super(scope, id);

        this.name = clusterProps.clusterName ?? Names.uniqueId(this);
        this.temporalVersion = clusterProps.temporalVersion ?? TemporalVersion.LATEST;
        this.temporalConfig = new TemporalConfiguration(this);

        const servicesProps = this.resolveServiceProps(clusterProps.services);

        this.ecsCluster = this.getOrCreateEcsCluster(clusterProps);

        if (clusterProps.cloudMapRegistration) {
            const serviceName = clusterProps.cloudMapRegistration.serviceName;
            const namespaceName = clusterProps.cloudMapRegistration.namespace.namespaceName;
            const port = this.temporalConfig.configuration.services.frontend.rpc.grpcPort;

            // Host for external client connections (through load balancer)
            this.host = `${serviceName}.${namespaceName}:${port}`;

            // Configure Web UI to connect to the internal frontend service via CloudMap
            // Using the main service name since frontend-specific service isn't registering
            const internalFrontendAddress = `${serviceName}.${namespaceName}:${port}`;
            this.temporalConfig.setWebGrpcAddress(internalFrontendAddress);
        } else {
            Annotations.of(this).addError(`Can't get cluster's host unless cloudMapRegistration has been configured`);
        }

        // FIXME: Add support for mixed datastores configuration (ie. SQL+Cassandra or SQL+ES)
        const datastore = this.getOrCreateDatastore(clusterProps);

        // Create a single database construct that handles both temporal and temporal_visibility databases
        // This eliminates timing issues and ensures both databases are created in the same Lambda execution
        const mainDatabase = new TemporalDatabase(this, 'MainDatabase', {
            datastore: datastore,
            databaseName: 'temporal', // FIXME: Make database name configurable (related to support for mixed datastore config)
            schemaType: 'main',
            removalPolicy: clusterProps.removalPolicy,
        });
        this.temporalConfig.attachDatabase(mainDatabase);

        // Note: We don't create a separate VisibilityDatabase construct anymore
        // The Lambda function now creates both 'temporal' and 'temporal_visibility' databases
        // in a single execution to avoid timing and dependency issues

        // Import security groups for services - replace with your security group IDs
        this.vpnSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'VpnSecurityGroup', 'sg-xxxxxxxx'); // Replace with your VPN security group ID
        const webSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'WebSecurityGroup', 'sg-yyyyyyyy'); // Replace with your web security group ID
        const serviceSecurityGroups = [this.vpnSecurityGroup, webSecurityGroup];

        const [configEfs, configEfsFiles] = this.setupConfigFileSystem(clusterProps, this.temporalConfig);
        this.configEfs = configEfs;

        this.services = {
            // Use single service for all server components (frontend, history, matching, worker)
            single: new SingleService(this, {
                machine: servicesProps.single.machine,
                customSubnets: ['subnet-xxxxxxxx'], // Replace with your private subnet ID
                securityGroups: serviceSecurityGroups
            }),

            // Keep web UI as separate service since temporalServer image doesn't include web UI
            web: servicesProps.web.enabled ? new WebService(this, {
                machine: servicesProps.web.machine,
                customSubnets: ['subnet-xxxxxxxx'], // Replace with your private subnet ID
                securityGroups: serviceSecurityGroups
            }) : undefined,

            // Disable individual server services when using single mode
            // frontend: new FrontendService(this, {
            //     machine: servicesProps.frontend.machine,
            //     customSubnets: ['subnet-xxxxxxxx'], // Replace with your private subnet ID
            //     securityGroups: serviceSecurityGroups
            // }),
            // matching: new MatchingService(this, {
            //     machine: servicesProps.matching.machine,
            //     customSubnets: ['subnet-xxxxxxxx'], // Replace with your private subnet ID
            //     securityGroups: serviceSecurityGroups
            // }),
            // history: new HistoryService(this, {
            //     machine: servicesProps.history.machine,
            //     customSubnets: ['subnet-xxxxxxxx'], // Replace with your private subnet ID
            //     securityGroups: serviceSecurityGroups
            // }),
            // worker: new WorkerService(this, {
            //     machine: servicesProps.worker.machine,
            //     customSubnets: ['subnet-xxxxxxxx'], // Replace with your private subnet ID
            //     securityGroups: serviceSecurityGroups
            // }),
        };

        // Create load balancer integration for Temporal Web UI (only if web service is enabled)
        let webLoadBalancer: TemporalWebLoadBalancer | undefined;
        if (this.services.web) {
            webLoadBalancer = new TemporalWebLoadBalancer(this, 'WebLoadBalancer', {
                webService: this.services.web, // Web service runs the UI on port 8080
                vpc: clusterProps.vpc,
            });

            // Note: Target group registration will be handled by the load balancer construct
            // The targets will be registered using the service ARN and target group ARNs
            // This is done automatically when the listeners are created
        }

        this.wireUpNetworkAuthorizations({ main: mainDatabase, visibility: mainDatabase });

        // Add dependencies to ensure EFS config files AND database schemas are ready before services start
        for (const configFile of configEfsFiles) {
            if (this.services.single) {
                this.services.single.cfnService.node.addDependency(configFile);
            }
            if (this.services.web) {
                this.services.web.cfnService.node.addDependency(configFile);
            }
        }

        // Add database dependencies to ensure schemas are applied before backend service starts
        if (this.services.single) {
            this.services.single.cfnService.node.addDependency(mainDatabase);
        }
        
        // WebService doesn't need database dependency since it connects through SingleService
        // But it should wait for SingleService to be ready
        if (this.services.web && this.services.single) {
            this.services.web.cfnService.node.addDependency(this.services.single.cfnService);
        }

        // Database dependencies are already handled above for the single service

        // Configure CloudMap (Service Discovery) for CfnService - required for service-to-service communication
        if (clusterProps.cloudMapRegistration) {
            this.configureCloudMapForServices(clusterProps.cloudMapRegistration);
        }
    }

    // FIXME: Refactor this
    private resolveServiceProps(
        services: ITemporalClusterProps['services'],
    ): Required<Omit<ITemporalClusterProps['services'], 'default'>> {
        const out: ITemporalClusterProps['services'] = {};

        for (const service of ['frontend', 'history', 'matching', 'worker', 'single', 'web'] as const) {
            out[service] = {
                ...services?.defaults,
                ...services?.[service],
                machine: {
                    ...defaultMachineProperties,
                    ...services?.defaults?.machine,
                    ...services?.[service]?.machine,
                },
            };
        }

        out.web.enabled ??= true;

        return out as Required<Omit<ITemporalClusterProps['services'], 'default'>>;
    }

    private getOrCreateDatastore(props: ITemporalClusterProps) {
        // FIXME: Validate that requested/provided datastore is supported by requested temporal server version
        // https://docs.temporal.io/docs/server/versions-and-dependencies/#server-versioning-and-support-policy

        if (props.datastore && props.datastoreOptions) {
            throw `You must specify either a datastore or datastoreOptions, not both.`;
        } else if (props.datastore) {
            return props.datastore;
        } else {
            return new AuroraServerlessTemporalDatastore(this, 'Datastore', {
                engine: DatabaseClusterEngine.auroraPostgres({ version: AuroraPostgresEngineVersion.VER_15_3 }),
                vpc: props.vpc,
                removalPolicy: props.removalPolicy,
                ...props.datastoreOptions,
            });
        }
    }

    private getOrCreateEcsCluster(props: ITemporalClusterProps) {
        if (props.ecsCluster) {
            return props.ecsCluster;
        } else {
            return new Cluster(this, 'EcsCluster', {
                vpc: props.vpc,
                enableFargateCapacityProviders: true,
                containerInsights: true,
            });
        }
    }

    private setupConfigFileSystem(props: ITemporalClusterProps, temporalConfig: TemporalConfiguration) {
        // Create EFS VPC Endpoint to allow ECS tasks to resolve EFS DNS names
        const efsVpcEndpoint = new InterfaceVpcEndpoint(this, 'EfsVpcEndpoint', {
            vpc: props.vpc,
            service: InterfaceVpcEndpointAwsService.ELASTIC_FILESYSTEM,
            subnets: { subnets: [Subnet.fromSubnetId(this, 'EfsEndpointSubnet', 'subnet-xxxxxxxx')] }, // Replace with your subnet ID
            securityGroups: [SecurityGroup.fromSecurityGroupId(this, 'EfsEndpointSG', 'sg-yyyyyyyy')], // Replace with your security group ID
            privateDnsEnabled: true,
        });

        // Create dedicated EFS security group
        const efsSecurityGroup = new SecurityGroup(this, 'ConfigFSSecurityGroup', {
            vpc: props.vpc,
            description: 'Security group for Temporal EFS access',
        });

        // Import ECS host security group to allow EFS access
        const ecsHostSecurityGroup = SecurityGroup.fromSecurityGroupId(
            this, 'EcsHostSecurityGroup', 'sg-zzzzzzzz' // Replace with your ECS host security group ID
        );

        // VPN security group is already imported above for services

        // Allow NFS access from ECS host and VPN security groups
        efsSecurityGroup.addIngressRule(ecsHostSecurityGroup, Port.tcp(2049));
        efsSecurityGroup.addIngressRule(this.vpnSecurityGroup, Port.tcp(2049));

        // Also allow access from web security group (used by ECS services)
        const webSecurityGroupForEfs = SecurityGroup.fromSecurityGroupId(this, 'WebSecurityGroupForEfs', 'sg-yyyyyyyy'); // Replace with your web security group ID
        efsSecurityGroup.addIngressRule(webSecurityGroupForEfs, Port.tcp(2049));

        // Use low-level constructs to bypass CDK mount target subnet bug (#27397)
        const cfnFileSystem = new CfnFileSystem(this, 'ConfigFS', {
            throughputMode: 'provisioned',
            provisionedThroughputInMibps: 100,
        });

        // Create mount target only in the subnet where services run
        const mountTarget = new CfnMountTarget(this, 'ConfigFSMountTarget1', {
            fileSystemId: cfnFileSystem.ref,
            subnetId: 'subnet-xxxxxxxx', // Replace with your private subnet ID where services run
            securityGroups: [efsSecurityGroup.securityGroupId],
        });

        // Wait for mount target to be available before proceeding
        const mountTargetWaiter = new AwsCustomResource(this, 'MountTargetWaiter', {
            onCreate: {
                service: 'EFS',
                action: 'describeMountTargets',
                parameters: {
                    MountTargetId: mountTarget.ref,
                },
                physicalResourceId: PhysicalResourceId.of(`mount-target-waiter-${mountTarget.ref}`),
            },
            onUpdate: {
                service: 'EFS',
                action: 'describeMountTargets',
                parameters: {
                    MountTargetId: mountTarget.ref,
                },
                physicalResourceId: PhysicalResourceId.of(`mount-target-waiter-${mountTarget.ref}`),
            },
            policy: AwsCustomResourcePolicy.fromSdkCalls({
                resources: AwsCustomResourcePolicy.ANY_RESOURCE,
            }),
            timeout: Duration.minutes(10), // Give mount target time to become available
        });
        mountTargetWaiter.node.addDependency(mountTarget);

        // Create access point for Lambda function access (root user with proper permissions)
        const cfnAccessPoint = new CfnAccessPoint(this, 'ConfigFSAccessPoint', {
            fileSystemId: cfnFileSystem.ref,
            posixUser: {
                uid: '0', // Root user for Lambda function
                gid: '0', // Root group for Lambda function
            },
            rootDirectory: {
                path: '/temporal',
                creationInfo: {
                    ownerUid: '0', // Root owns the directories
                    ownerGid: '0', // Root group owns the directories
                    permissions: '0755', // Full permissions for root, read/execute for others
                },
            },
        });

        // Create compatibility wrappers for existing code
        const configEfs = FileSystem.fromFileSystemAttributes(this, 'ConfigEfsWrapper', {
            fileSystemId: cfnFileSystem.ref,
            securityGroup: efsSecurityGroup,
        });

        const accessPointWrapper = AccessPoint.fromAccessPointAttributes(this, 'ConfigEfsAccessPointWrapper', {
            accessPointId: cfnAccessPoint.ref,
            fileSystem: configEfs,
        });

        this.configEfsAccessPoint = accessPointWrapper;

        // Import the specific subnet for Lambda functions
        const lambdaSubnet = Subnet.fromSubnetAttributes(this, 'LambdaSubnet', {
            subnetId: 'subnet-xxxxxxxx', // Replace with your private subnet ID
            availabilityZone: 'us-west-2a', // Replace with your availability zone
            routeTableId: 'rtb-xxxxxxxx' // Replace with your route table ID
        });

        const dynamicConfigFile = new EfsFile(this, 'TemporalDynamicConfig-v2', {
            fileSystem: configEfs,
            path: `/dynamic_config/dynamic_config.yaml`, // Relative to access point root (/temporal)
            vpc: props.vpc,
            vpcSubnets: { subnets: [lambdaSubnet] }, // Same subnet as EFS mount target
            contents: Lazy.string({ produce: () => temporalConfig.stringifyDynamic() }),
            accessPoint: accessPointWrapper,
            mountTargetDependency: mountTargetWaiter,
        });

        const webConfigFile = new EfsFile(this, 'TemporalWebConfig-v3', {
            fileSystem: configEfs,
            path: `/web_config/web_config.yaml`, // Relative to access point root (/temporal)
            vpc: props.vpc,
            vpcSubnets: { subnets: [lambdaSubnet] }, // Same subnet as EFS mount target
            contents: Lazy.string({ produce: () => temporalConfig.stringifyWeb() }),
            accessPoint: accessPointWrapper,
            mountTargetDependency: mountTargetWaiter,
        });

        // Dependencies are handled through mountTargetDependency in EfsFile constructor

        return [configEfs, [dynamicConfigFile, webConfigFile]] as const;
    }

    private wireUpNetworkAuthorizations(databases: { main: TemporalDatabase; visibility: TemporalDatabase }) {
        const asConnections = (defaultPort: number | undefined, nodeTypes: TemporalNodeType[]) => {
            return new Connections({
                securityGroups: nodeTypes.flatMap(
                    (nodeType) => this.services[nodeType]?.connections?.securityGroups || [],
                ),
                defaultPort: defaultPort ? Port.tcp(defaultPort) : undefined,
            });
        };

        const portsConfig = this.temporalConfig.configuration.services;

        // Note that the single machine, if activated, plays all server roles
        const frontendConnections = asConnections(portsConfig.frontend.rpc.grpcPort, ['frontend', 'single']);
        const historyConnections = asConnections(portsConfig.history.rpc.grpcPort, ['history', 'single']);
        const matchingConnections = asConnections(portsConfig.matching.rpc.grpcPort, ['matching', 'single']);
        const workerConnections = asConnections(portsConfig.worker.rpc.grpcPort, ['worker', 'single']);
        const webConnections = asConnections(8088, ['web']); // Temporal Web UI port



        // Security group access is now handled directly in BaseService by using existing security groups

        // Simplified security group configuration - all services use the same VPN security group
        // so we don't need complex cross-communication rules that create duplicates

        // Only allow database access (these are needed for the services to function)
        frontendConnections.allowToDefaultPort(databases.main.datastore);
        frontendConnections.allowToDefaultPort(databases.visibility.datastore);
        matchingConnections.allowToDefaultPort(databases.main.datastore);
        historyConnections.allowToDefaultPort(databases.main.datastore);
        workerConnections.allowToDefaultPort(databases.main.datastore);
        webConnections.allowToDefaultPort(frontendConnections);

        this.rolesConnections = {
            frontend: frontendConnections,
            history: historyConnections,
            matching: matchingConnections,
            worker: workerConnections,
            web: webConnections,
        };
    }

    public get connections(): Connections {
        // Return single service connections when using single mode, otherwise frontend
        return this.services.single?.connections || this.rolesConnections.frontend;
    }

    private configureCloudMapForServices(cloudMapRegistration: ITemporalClusterProps['cloudMapRegistration']) {
        if (!cloudMapRegistration) return;

        // Import the existing namespace
        const namespace = cloudMapRegistration.namespace;
        
        // Configure CloudMap service registration for both backend and web services
        const services = [];

        if (this.services.single) {
            services.push({ name: '', service: this.services.single }); // Register single service as just 'temporal' (no suffix)
        }
        
        if (this.services.web) {
            services.push({ name: 'web', service: this.services.web }); // Register web service as 'temporal-web'
        }

        // For CfnService, we need to manually configure service registries
        // This creates the service discovery entries that allow services to find each other
        services.forEach(({ name, service }) => {
            // Create CloudMap service for this Temporal service
            const cloudMapService = new AwsCustomResource(this, `CloudMapService-${name}`, {
                onCreate: {
                    service: 'ServiceDiscovery',
                    action: 'createService',
                    parameters: {
                        Name: name ? `${cloudMapRegistration.serviceName}-${name}` : cloudMapRegistration.serviceName,
                        NamespaceId: namespace.namespaceId,
                        DnsConfig: {
                            DnsRecords: [{
                                Type: 'A',
                                TTL: 300
                            }]
                        },
                        HealthCheckCustomConfig: {
                            FailureThreshold: 1
                        }
                    },
                    physicalResourceId: PhysicalResourceId.fromResponse('Service.Id')
                },
                // onDelete removed to prevent JSON parsing errors during stack deletion
                // CloudFormation will handle cleanup through resource dependencies
                policy: AwsCustomResourcePolicy.fromSdkCalls({
                    resources: AwsCustomResourcePolicy.ANY_RESOURCE
                }),
                removalPolicy: RemovalPolicy.DESTROY
            });

            // Update the CfnService to register with CloudMap
            // Note: For A record type services, Port should NOT be specified
            // Port is only required for SRV record types
            service.cfnService.addPropertyOverride('ServiceRegistries', [{
                RegistryArn: cloudMapService.getResponseField('Service.Arn')
                // Port: port  // Removed - not needed for A record type
            }]);

            // Add dependency to ensure CloudMap service is created first
            service.cfnService.node.addDependency(cloudMapService);
        });
    }
}
