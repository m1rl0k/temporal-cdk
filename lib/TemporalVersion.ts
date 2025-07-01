import { DockerImage } from 'aws-cdk-lib';

// https://github.com/temporalio/temporal/releases
export class TemporalVersion {
    public static V1_13_0 = new TemporalVersion('1.13.0');
    public static V1_13_1 = new TemporalVersion('1.13.1');
    public static V1_13_2 = new TemporalVersion('1.13.2');
    public static V1_13_3 = new TemporalVersion('1.13.3');
    public static V1_13_4 = new TemporalVersion('1.13.4');

    public static V1_14_0 = new TemporalVersion('1.14.0');
    public static V1_14_1 = new TemporalVersion('1.14.1');
    public static V1_14_2 = new TemporalVersion('1.14.2');
    public static V1_14_3 = new TemporalVersion('1.14.3');
    public static V1_14_4 = new TemporalVersion('1.14.4');
    public static V1_14_5 = new TemporalVersion('1.14.5');
    public static V1_14_6 = new TemporalVersion('1.14.6');

    public static V1_15_0 = new TemporalVersion('1.15.0');
    public static V1_15_1 = new TemporalVersion('1.15.1');
    public static V1_15_2 = new TemporalVersion('1.15.2');

    public static V1_16_0 = new TemporalVersion('1.16.0');
    public static V1_16_1 = new TemporalVersion('1.16.1');
    public static V1_16_2 = new TemporalVersion('1.16.2');

    public static V1_28 = new TemporalVersion('1.28');

    public static LATEST = TemporalVersion.V1_28;

    private constructor(public version: string, private customizations?: {
        repositoryBase: string;
        imageNames?: {
            temporalServer?: string;
            temporalAdminTools?: string;
            temporalUI?: string;
        };
    }) {
        // FIXME: Assert that (if defined), repositoryBase ends with /
    }

    public get containerImages() {
        const prefix = this.customizations?.repositoryBase ?? '';
        const imageNames = this.customizations?.imageNames ?? {};

        // FIXME: Rethink how we handle versionning in this class. Not all components have the same version
        return {
            temporalServer: DockerImage.fromRegistry(`${prefix}${imageNames.temporalServer ?? 'temporalio/server'}:${this.version}`),
            temporalAdminTools: DockerImage.fromRegistry(`${prefix}${imageNames.temporalAdminTools ?? 'temporalio/admin-tools'}:${this.version}`),
            temporalUI: DockerImage.fromRegistry(`${prefix}${imageNames.temporalUI ?? 'temporalio/ui'}:latest`),
        };
    }

    public withCustomizations(customizations: {
        repositoryBase: string;
        imageNames?: {
            temporalServer?: string;
            temporalAdminTools?: string;
            temporalUI?: string;
        };
    }) {
        return new TemporalVersion(this.version, customizations);
    }
}
