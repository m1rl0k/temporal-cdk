import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Stack, Duration } from 'aws-cdk-lib';
import { IFileSystem } from 'aws-cdk-lib/aws-efs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { IVpc, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

interface IEfsFileProviderProps {
    readonly vpc: IVpc;
    readonly vpcSubnets?: SubnetSelection;
    readonly fileSystem: IFileSystem;
    readonly rootDir: string;
    readonly accessPoint?: any;
    readonly mountTargetDependency?: Construct;
}

export class EfsFileProvider extends Construct {
    /**
     * Returns the singleton provider corresponding to the given vpc and file system.
     */
    public static getOrCreate(scope: Construct, props: IEfsFileProviderProps) {
        const id = `CustomResource-EfsFileProvider-${props.vpc.node.addr}-${
            props.fileSystem.node.addr
        }-${props.rootDir.slice(1)}`;
        const stack = Stack.of(scope);
        const x = (stack.node.tryFindChild(id) as EfsFileProvider) || new EfsFileProvider(stack, id, props);
        return x.provider.serviceToken;
    }

    private readonly provider: Provider;

    constructor(scope: Construct, id: string, props: IEfsFileProviderProps) {
        super(scope, id);

        this.node.addDependency(props.vpc);

        // Use provided access point or create a default one for backward compatibility
        const accessPoint = props.accessPoint || props.fileSystem;

        const lambdaFunction = new NodejsFunction(this, 'OnEventHandler', {
            entry: require.resolve('./EfsFileHandler'),
            runtime: lambda.Runtime.NODEJS_18_X, // Use Node 18 to avoid deprecation warnings
            handler: 'onEvent',
            vpc: props.vpc,
            vpcSubnets: props.vpcSubnets,
            allowPublicSubnet: true, // Allow Lambda in subnet with MapPublicIpOnLaunch=true
            filesystem: lambda.FileSystem.fromEfsAccessPoint(accessPoint, `/mnt${props.rootDir}`),
            timeout: Duration.minutes(10), // Increase timeout for EFS operations
            memorySize: 256, // Increase memory for better performance
        });

        // Add dependency on mount target if provided
        if (props.mountTargetDependency) {
            lambdaFunction.node.addDependency(props.mountTargetDependency);
        }

        this.provider = new Provider(this, 'Provider', {
            onEventHandler: lambdaFunction,
            logRetention: RetentionDays.FIVE_DAYS,
        });
    }
}
