import { TemporalCluster } from '..';
import { BaseTemporalService, IBaseTemporalServiceProps } from './BaseService';

export class SingleService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine' | 'customSubnets' | 'securityGroups' | 'desiredCount'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Single', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            customSubnets: props.customSubnets,
            securityGroups: props.securityGroups,
            desiredCount: props.desiredCount || 2, // Increase to 3 tasks for better system worker capacity
            environment: {
                SERVICES: 'frontend:history:matching:worker',
                ...cluster.temporalConfig.toEnvironmentVariables(),
                // Worker Versioning is now enabled via dynamic configuration
                // System worker configuration to fix "Not enough hosts" errors
                TEMPORAL_SYSTEM_WORKER_ENABLED: 'true',
                TEMPORAL_SYSTEM_WORKER_CONCURRENCY: '1000',
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/dynamic_config', // Relative to access point root (/temporal)
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                    accessPoint: cluster.configEfsAccessPoint,
                },
            ],
            exposedPorts: [
                cluster.temporalConfig.configuration.services.frontend.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.frontend.rpc.membershipPort,
                cluster.temporalConfig.configuration.services.history.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.history.rpc.membershipPort,
                cluster.temporalConfig.configuration.services.matching.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.matching.rpc.membershipPort,
                cluster.temporalConfig.configuration.services.worker.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.worker.rpc.membershipPort,
            ],
        });
    }
}

export class FrontendService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine' | 'customSubnets' | 'securityGroups'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Frontend', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            customSubnets: props.customSubnets,
            securityGroups: props.securityGroups,
            environment: {
                SERVICES: 'frontend',
                ...cluster.temporalConfig.toEnvironmentVariables(),
                // Worker Versioning is now enabled via dynamic configuration
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/dynamic_config', // Relative to access point root (/temporal)
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                    accessPoint: cluster.configEfsAccessPoint,
                },
            ],
            exposedPorts: [
                cluster.temporalConfig.configuration.services.frontend.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.frontend.rpc.membershipPort,
            ],
        });
    }
}

export class HistoryService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine' | 'customSubnets' | 'securityGroups'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'History', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            customSubnets: props.customSubnets,
            securityGroups: props.securityGroups,
            environment: {
                SERVICES: 'history',
                ...cluster.temporalConfig.toEnvironmentVariables(),
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/dynamic_config', // Relative to access point root (/temporal)
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                    accessPoint: cluster.configEfsAccessPoint,
                },
            ],
            exposedPorts: [
                cluster.temporalConfig.configuration.services.history.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.history.rpc.membershipPort,
            ],
        });
    }
}

export class MatchingService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine' | 'customSubnets' | 'securityGroups'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Matching', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            customSubnets: props.customSubnets,
            securityGroups: props.securityGroups,
            environment: {
                SERVICES: 'matching',
                ...cluster.temporalConfig.toEnvironmentVariables(),
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/dynamic_config', // Relative to access point root (/temporal)
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                    accessPoint: cluster.configEfsAccessPoint,
                },
            ],
            exposedPorts: [
                cluster.temporalConfig.configuration.services.matching.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.matching.rpc.membershipPort,
            ],
        });
    }
}

export class WorkerService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine' | 'customSubnets' | 'securityGroups'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Worker', {
            image: cluster.temporalVersion.containerImages.temporalServer,
            machine: props.machine,
            customSubnets: props.customSubnets,
            securityGroups: props.securityGroups,
            environment: {
                SERVICES: 'worker',
                ...cluster.temporalConfig.toEnvironmentVariables(),
            },
            secrets: {
                ...cluster.temporalConfig.toSecrets(),
            },
            volumes: [
                {
                    name: 'dynamic_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/dynamic_config', // Relative to access point root (/temporal)
                    containerPath: `/etc/temporal/dynamic_config`,
                    readOnly: true,
                    accessPoint: cluster.configEfsAccessPoint,
                },
            ],
            exposedPorts: [
                cluster.temporalConfig.configuration.services.worker.rpc.grpcPort,
                cluster.temporalConfig.configuration.services.worker.rpc.membershipPort,
            ],
        });
    }
}


export class WebService extends BaseTemporalService {
    constructor(cluster: TemporalCluster, props: Pick<IBaseTemporalServiceProps, 'machine' | 'customSubnets' | 'securityGroups'>) {
        // const clusterProps: ITemporalClusterProps;

        super(cluster, 'Web', {
            image: cluster.temporalVersion.containerImages.temporalUI,
            machine: props.machine,
            customSubnets: props.customSubnets,
            securityGroups: props.securityGroups,
            environment: {
                // Use the internal frontend service address for Web UI connection
                TEMPORAL_ADDRESS: cluster.host,

                // Web UI Configuration via Environment Variables
                TEMPORAL_UI_PORT: '8080',
                TEMPORAL_DEFAULT_NAMESPACE: 'default',
                TEMPORAL_DISABLE_WRITE_ACTIONS: 'false', // Enable write actions (workflows, activities)
                TEMPORAL_START_WORKFLOW_DISABLED: 'false', // Enable starting workflows from UI
                TEMPORAL_SHOW_TEMPORAL_SYSTEM_NAMESPACE: 'false',
                TEMPORAL_NOTIFY_ON_NEW_VERSION: 'true',
                TEMPORAL_AUTH_ENABLED: 'false',
                TEMPORAL_TLS_ENABLE_HOST_VERIFICATION: 'false',
            },
            volumes: [
                {
                    name: 'web_config',
                    fileSystem: cluster.configEfs,
                    volumePath: '/web_config', // Relative to access point root (/temporal)
                    containerPath: `/etc/temporal/web_config`,
                    readOnly: true,
                    accessPoint: cluster.configEfsAccessPoint,
                },
            ],
            exposedPorts: [
                8080, // Temporal Web UI port (standard port)
            ],
        });
    }
}
