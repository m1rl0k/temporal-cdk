import { CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { TemporalCluster } from '../..';
import { ITemporalNamespaceResourceProperties } from './TemporalNamespaceHandler';
import { TemporalNamespaceProvider } from './TemporalNamespaceProvider';

export class TemporalNamespace extends Construct {
    public readonly name: string;

    constructor(cluster: TemporalCluster, name: string) {
        super(cluster, `Namespace-${name}`);

        const provider = TemporalNamespaceProvider.getOrCreate(cluster);

        const resource = new CustomResource(this, 'Resource', {
            serviceToken: provider,
            resourceType: 'Custom::TemporalNamespace',
            properties: <ITemporalNamespaceResourceProperties>{
                TemporalHost: cluster.host,
                NamespaceName: name,
            },
        });
        // Add dependency on the appropriate Temporal service (single service or frontend)
        const temporalService = cluster.services.single || cluster.services.frontend;
        if (temporalService) {
            resource.node.addDependency(temporalService.cfnService);
        }

        this.name = name;
    }
}
