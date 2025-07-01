import { Duration } from 'aws-cdk-lib';
import { Port } from 'aws-cdk-lib/aws-ec2';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { TemporalCluster } from '../..';
import { AdminToolsLayer } from './AdminToolsLayer';

export class TemporalNamespaceProvider extends Construct {
    /**
     * We create a single instance of this provider by Temporal cluster.
     * Privileges for that single instance's lambda function are then expanded
     * to include network access and secret access for each datastore.
     */
    public static getOrCreate(cluster: TemporalCluster) {
        const id = 'CustomResource-TemporalNamespaceProvider';
        const provider =
            (cluster.node.tryFindChild(id) as TemporalNamespaceProvider) ?? new TemporalNamespaceProvider(cluster, id);

        provider.expandPrivilegesToTemporal(cluster);

        return provider.provider.serviceToken;
    }

    private readonly provider: Provider;
    private readonly lambdaFunction: NodejsFunction;

    constructor(cluster: TemporalCluster, id: string) {
        super(cluster, id);

        this.node.addDependency(cluster.ecsCluster.vpc);

        this.lambdaFunction = new NodejsFunction(this, 'OnEventHandler', {
            entry: require.resolve('./TemporalNamespaceHandler'),
            runtime: Runtime.NODEJS_20_X,
            handler: 'onEvent',
            vpc: cluster.ecsCluster.vpc,
            layers: [AdminToolsLayer.getOrCreate(this, cluster.temporalVersion)],
            timeout: Duration.minutes(5),
        });

        this.provider = new Provider(this, 'Provider', {
            onEventHandler: this.lambdaFunction,
            logRetention: RetentionDays.ONE_DAY,
        });
    }

    private expandPrivilegesToTemporal(cluster: TemporalCluster) {
        // Allow the namespace provider Lambda to connect to Temporal frontend on port 7233
        const frontendPort = cluster.temporalConfig.configuration.services.frontend.rpc.grpcPort;
        this.lambdaFunction.connections.allowTo(cluster.connections, Port.tcp(frontendPort), 'Allow namespace provider to connect to Temporal frontend');
    }
}
