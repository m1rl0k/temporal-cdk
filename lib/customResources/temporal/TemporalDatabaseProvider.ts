import { Duration } from 'aws-cdk-lib';
import { Subnet } from 'aws-cdk-lib/aws-ec2';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { ITemporalDatastore, TemporalCluster } from '../..';
import { AdminToolsLayer } from './AdminToolsLayer';

export class TemporalDatabaseProvider extends Construct {
    /**
     * We create a single instance of this provider by Temporal cluster.
     * Privileges for that single instance's lambda function are then expanded
     * to include network access and secret access for each datastore.
     */
    public static getOrCreate(cluster: TemporalCluster, datastore: ITemporalDatastore) {
        const id = 'CustomResource-TemporalDatabaseProvider';
        const provider =
            (cluster.node.tryFindChild(id) as TemporalDatabaseProvider) ?? new TemporalDatabaseProvider(cluster, id);

        provider.expandPrivilegesToDatastore(datastore);

        return provider.provider.serviceToken;
    }

    private readonly provider: Provider;
    private readonly lambdaFunction: NodejsFunction;

    constructor(cluster: TemporalCluster, id: string) {
        super(cluster, id);

        this.node.addDependency(cluster.ecsCluster.vpc);

        // Use the same subnet as other services
        const lambdaSubnet = Subnet.fromSubnetId(this, 'LambdaSubnet', 'subnet-xxxxxxxx'); // Replace with your private subnet ID

        this.lambdaFunction = new NodejsFunction(this, 'OnEventHandler', {
            entry: require.resolve('./TemporalDatabaseHandler'),
            runtime: Runtime.NODEJS_20_X,
            handler: 'onEvent',
            vpc: cluster.ecsCluster.vpc,
            vpcSubnets: {
                subnets: [lambdaSubnet], // Development web private 2a subnet
            },
            allowPublicSubnet: true, // Allow Lambda in subnet with MapPublicIpOnLaunch=true
            layers: [AdminToolsLayer.getOrCreate(this, cluster.temporalVersion)],
            timeout: Duration.minutes(10),
        });

        this.provider = new Provider(this, 'Provider', {
            onEventHandler: this.lambdaFunction,
            logRetention: RetentionDays.ONE_DAY,
        });
    }

    private expandPrivilegesToDatastore(datastore: ITemporalDatastore) {
        this.lambdaFunction.connections.allowToDefaultPort(datastore);
        datastore.secret.grantRead(this.lambdaFunction);
    }
}
