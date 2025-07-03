import { Construct } from 'constructs';
import {
    ApplicationLoadBalancer,
    ApplicationListener,
    ApplicationTargetGroup,
    TargetType,
    ApplicationProtocol,
    Protocol,
    ListenerAction,
    ListenerCondition,
    ApplicationListenerRule,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { LoadBalancerTarget } from 'aws-cdk-lib/aws-route53-targets';
import { CfnService } from 'aws-cdk-lib/aws-ecs';
import { SecurityGroup, IVpc, Port } from 'aws-cdk-lib/aws-ec2';
import { Duration } from 'aws-cdk-lib';
import { BaseTemporalService } from './BaseService';

export interface TemporalWebLoadBalancerProps {
    readonly webService: BaseTemporalService;
    readonly vpc: IVpc;
}

/**
 * Construct to integrate Temporal Web UI with existing internal and external Application Load Balancers.
 * This construct adds listener rules to existing HTTPS listeners for host-based routing.
 */
export class TemporalWebLoadBalancer extends Construct {
    constructor(scope: Construct, id: string, props: TemporalWebLoadBalancerProps) {
        super(scope, id);

        // We'll import listeners directly since that's what we need for the rules

        // Import existing ALBs to get their DNS names for Route53 records
        const externalAlb = ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, 'ExternalALB', {
            loadBalancerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/external-alb/xxxxxxxxxxxxxxxx', // Replace with your external ALB ARN
            loadBalancerDnsName: 'external-alb-xxxxxxxxx.us-west-2.elb.amazonaws.com', // Replace with your external ALB DNS name
            loadBalancerCanonicalHostedZoneId: 'Z1H1FL5HABSF5', // Replace with your ALB hosted zone ID
            securityGroupId: 'sg-xxxxxxxx', // Replace with your ALB security group ID
            vpc: props.vpc,
        });

        const internalAlb = ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, 'InternalALB', {
            loadBalancerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:loadbalancer/app/internal-alb/yyyyyyyyyyyyyyyy', // Replace with your internal ALB ARN
            loadBalancerDnsName: 'internal-alb-yyyyyyyyy.us-west-2.elb.amazonaws.com', // Replace with your internal ALB DNS name
            loadBalancerCanonicalHostedZoneId: 'Z1H1FL5HABSF5', // Replace with your ALB hosted zone ID
            securityGroupId: 'sg-xxxxxxxx', // Replace with your ALB security group ID
            vpc: props.vpc,
        });

        // Import ALB security group (both ALBs use the same security group)
        const albSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'AlbSecurityGroup', 'sg-xxxxxxxx'); // Replace with your ALB security group ID

        // Import existing HTTPS listeners by ARN
        const externalListener = ApplicationListener.fromApplicationListenerAttributes(this, 'ExternalListener', {
            listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/external-alb/xxxxxxxxxxxxxxxx/yyyyyyyyyyyyyyyy', // Replace with your external listener ARN
            securityGroup: albSecurityGroup,
        });

        // Import existing internal HTTPS listener by ARN
        const internalListener = ApplicationListener.fromApplicationListenerAttributes(this, 'InternalListener', {
            listenerArn: 'arn:aws:elasticloadbalancing:us-west-2:123456789012:listener/app/internal-alb/yyyyyyyyyyyyyyyy/zzzzzzzzzzzzzzzz', // Replace with your internal listener ARN
            securityGroup: albSecurityGroup,
        });
        
        // Import hosted zones for SSL certificate validation
        const externalHostedZone = HostedZone.fromHostedZoneAttributes(this, 'ExternalHostedZone', {
            hostedZoneId: 'ZXXXXXXXXXXXXX', // Replace with your external hosted zone ID
            zoneName: 'example.com', // Replace with your domain
        });

        const internalHostedZone = HostedZone.fromHostedZoneAttributes(this, 'InternalHostedZone', {
            hostedZoneId: 'ZYYYYYYYYYYYYYY', // Replace with your internal hosted zone ID
            zoneName: 'internal.example.com', // Replace with your internal domain
        });

        // Create SSL certificates - use external ALB for validation since internal ALB can't reach internet
        const externalCertificate = new Certificate(this, 'ExternalCertificate', {
            domainName: 'temporal.example.com', // Replace with your external domain
            validation: CertificateValidation.fromDns(externalHostedZone),
        });

        // Internal certificate: Create certificate for internal domain but validate via external ALB
        // Since internal ALB can't reach internet, we validate this certificate using external resources
        const internalCertificate = new Certificate(this, 'InternalCertificate', {
            domainName: 'temporal.internal.example.com', // Replace with your internal domain
            // Use external hosted zone for validation since internal ALB can't reach internet for validation
            validation: CertificateValidation.fromDns(externalHostedZone),
        });
        
        // Create target groups for Temporal Web UI (matching dc.yml configuration)
        const externalTargetGroup = new ApplicationTargetGroup(this, 'ExternalTargetGroup', {
            port: 8080, // Temporal Web UI runs on port 8080
            protocol: ApplicationProtocol.HTTP,
            targetType: TargetType.IP,
            vpc: props.vpc,
            healthCheck: {
                enabled: true,
                path: '/favicon.ico', // Temporal Web UI favicon as health check - simpler response
                interval: Duration.seconds(30), // More frequent health checks
                timeout: Duration.seconds(10), // Shorter timeout
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                protocol: Protocol.HTTP,
            },
        });

        const internalTargetGroup = new ApplicationTargetGroup(this, 'InternalTargetGroup', {
            port: 8080, // Temporal Web UI runs on port 8080
            protocol: ApplicationProtocol.HTTP,
            targetType: TargetType.IP,
            vpc: props.vpc,
            healthCheck: {
                enabled: true,
                path: '/favicon.ico', // Temporal Web UI favicon as health check - simpler response
                interval: Duration.seconds(30), // More frequent health checks
                timeout: Duration.seconds(10), // Shorter timeout
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                protocol: Protocol.HTTP, // Explicitly use Protocol.HTTP
                healthyHttpCodes: '200-399', // Accept 200-399 as healthy responses
            },
        });

        // Import web security group and allow ALB access to port 8080
        const webSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'WebSecurityGroup', 'sg-yyyyyyyy'); // Replace with your web security group
        webSecurityGroup.addIngressRule(
            albSecurityGroup,
            Port.tcp(8080),
            'Allow ALB health checks and traffic to Temporal Web UI'
        );

        // Add our certificates to the existing listeners
        // External listener gets both certificates (external cert for its domain, internal cert for validation)
        externalListener.addCertificates('ExternalCert', [externalCertificate]);
        externalListener.addCertificates('InternalCertForValidation', [internalCertificate]);

        // Internal listener gets the internal certificate (which was validated via external ALB)
        // Use same pattern as external listener for consistency
        internalListener.addCertificates('InternalCert', [internalCertificate]);

        // Add listener rules to existing HTTPS listeners for host-based routing
        new ApplicationListenerRule(this, 'ExternalListenerRule', {
            listener: externalListener,
            priority: 200, // Use high priority to avoid conflicts with existing rules
            conditions: [
                ListenerCondition.hostHeaders(['temporal.example.com']), // Replace with your external domain
            ],
            action: ListenerAction.forward([externalTargetGroup]),
        });

        new ApplicationListenerRule(this, 'InternalListenerRule', {
            listener: internalListener,
            priority: 200,
            conditions: [
                ListenerCondition.hostHeaders(['temporal.internal.example.com']), // Replace with your internal domain
            ],
            action: ListenerAction.forward([internalTargetGroup]),
        });
        
        // Wire the Web service to target groups
        const webService = props.webService.cfnService as CfnService;
        // Container name follows the pattern: ${cluster.name}-${serviceId}
        const containerName = `${props.webService.temporalCluster.name}-Web`;
        webService.loadBalancers = [
            {
                targetGroupArn: externalTargetGroup.targetGroupArn,
                containerName: containerName,
                containerPort: 8080,
            },
            {
                targetGroupArn: internalTargetGroup.targetGroupArn,
                containerName: containerName,
                containerPort: 8080,
            },
        ];

        // Create Route53 A records to point domains to the ALBs
        // External: temporal.example.com -> External ALB
        new ARecord(this, 'ExternalDnsRecord', {
            zone: externalHostedZone,
            recordName: 'temporal', // Creates temporal.example.com
            target: RecordTarget.fromAlias(new LoadBalancerTarget(externalAlb)),
        });

        // Internal: temporal.internal.example.com -> Internal ALB
        new ARecord(this, 'InternalDnsRecord', {
            zone: internalHostedZone,
            recordName: 'temporal', // Creates temporal.internal.example.com
            target: RecordTarget.fromAlias(new LoadBalancerTarget(internalAlb)),
        });

    }
}
