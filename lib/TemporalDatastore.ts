import { Construct, IDependable } from 'constructs';
import { Connections, IConnectable, IVpc, SubnetSelection, InstanceType, InstanceClass, InstanceSize } from 'aws-cdk-lib/aws-ec2';
import {
    IClusterEngine,
    DatabaseCluster,
    DatabaseClusterProps,
    CfnDBCluster,
    ClusterInstance,
} from 'aws-cdk-lib/aws-rds';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { RemovalPolicy, Aspects } from 'aws-cdk-lib';

export interface ITemporalDatastore extends IConnectable, IDependable {
    readonly plugin: 'mysql' | 'postgres' | 'cassandra' | 'elasticsearch';
    readonly host: string;
    readonly port: number;
    readonly secret: ISecret;
}

// interface IExistingAuroraServerlessMySqlClusterProps {}

// export function fromExistingAuroraServerlessMySqlCluster(
//     scope: Construct,
//     id: string,
//     props: IExistingAuroraServerlessMySqlClusterProps,
// ) {}

export interface IAuroraTemporalDatastoreProps {
    readonly engine: IClusterEngine;

    readonly vpc: IVpc;
    readonly vpcSubnets?: SubnetSelection;

    readonly instanceType?: InstanceType;

    readonly removalPolicy?: RemovalPolicy;

    readonly otherClusterProps?: Partial<Omit<DatabaseClusterProps, 'engine' | 'vpc'>>;
}

export interface IAuroraServerlessTemporalDatastoreProps {
    readonly engine: IClusterEngine;

    readonly vpc: IVpc;
    readonly vpcSubnets?: SubnetSelection;

    readonly scaling?: {
        minCapacity?: number;
        maxCapacity?: number;
    };

    readonly removalPolicy?: RemovalPolicy;

    readonly otherServerlessClusterProps?: Partial<Omit<DatabaseClusterProps, 'engine' | 'vpc'>>;
}

export class AuroraTemporalDatastore extends Construct implements ITemporalDatastore {
    public readonly databaseCluster: DatabaseCluster;
    public readonly plugin: 'mysql' | 'postgres' | 'cassandra' | 'elasticsearch';

    constructor(scope: Construct, id: string, props: IAuroraTemporalDatastoreProps) {
        super(scope, id);

        this.databaseCluster = new DatabaseCluster(this, 'AuroraCluster', {
            engine: props.engine,
            vpc: props.vpc,
            vpcSubnets: props.vpcSubnets,

            // Use modern writer/readers configuration
            writer: ClusterInstance.provisioned('writer', {
                instanceType: props.instanceType || InstanceType.of(InstanceClass.T4G, InstanceSize.MEDIUM),
            }),

            removalPolicy: RemovalPolicy.DESTROY,
            deletionProtection: false,

            ...props.otherClusterProps,
        });

        // Use PostgreSQL plugin for Aurora PostgreSQL
        this.plugin = 'postgres';
    }

    public get host(): string {
        return this.databaseCluster.clusterEndpoint.hostname;
    }

    public get port(): number {
        return this.databaseCluster.clusterEndpoint.port;
    }

    public get secret(): ISecret {
        return this.databaseCluster.secret;
    }

    public get connections(): Connections {
        return this.databaseCluster.connections;
    }
}

export class AuroraServerlessTemporalDatastore extends Construct implements ITemporalDatastore {
    public readonly databaseCluster: DatabaseCluster;
    public readonly plugin: 'mysql' | 'postgres' | 'cassandra' | 'elasticsearch';

    constructor(scope: Construct, id: string, props: IAuroraServerlessTemporalDatastoreProps) {
        super(scope, id);

        this.databaseCluster = new DatabaseCluster(this, 'ServerlessV2Cluster', {
            engine: props.engine,

            // Use serverless instance type for Aurora Serverless v2
            instances: 1,
            instanceProps: {
                instanceType: new InstanceType('serverless'),
                vpc: props.vpc,
                vpcSubnets: props.vpcSubnets,
            },

            removalPolicy: props.removalPolicy,
            deletionProtection: props.removalPolicy === RemovalPolicy.RETAIN,

            ...props.otherServerlessClusterProps,
        });

        // Add Aurora Serverless v2 scaling configuration using Aspects
        Aspects.of(this.databaseCluster).add({
            visit(node) {
                if (node instanceof CfnDBCluster) {
                    node.serverlessV2ScalingConfiguration = {
                        minCapacity: props.scaling?.minCapacity ?? 0.5, // Default min capacity
                        maxCapacity: props.scaling?.maxCapacity ?? 2,   // Default max capacity
                    };
                }
            },
        });

        // Use MySQL plugin for Aurora MySQL
        this.plugin = 'mysql';
    }

    public get host(): string {
        return this.databaseCluster.clusterEndpoint.hostname;
    }

    public get port(): number {
        return this.databaseCluster.clusterEndpoint.port;
    }

    public get secret(): ISecret {
        return this.databaseCluster.secret;
    }

    public get connections(): Connections {
        return this.databaseCluster.connections;
    }
}
