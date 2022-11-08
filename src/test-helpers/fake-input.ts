import { InputOptions } from "@actions/core";

export interface FakeInput {
    action?: string;
    service?: string;
    'source-connection-arn'?: string;
    'access-role-arn'?: string;
    repo?: string;
    image?: string;
    runtime?: string;
    'build-command'?: string;
    'start-command'?: string;
    port?: string;
    'wait-for-service-stability'?: string;
    'wait-for-service-stability-seconds'?: string;
    region?: string;
    branch?: string;
    cpu?: string;
    memory?: string;
}

export function getFakeInput(config: FakeInput, name: string, options?: InputOptions): string {
    if (Object.keys(config).includes(name)) {
        return (config as { [key: string]: string })[name];
    } else {
        if (options?.required) {
            throw new Error(`${name} is required`);
        } else {
            return '';
        }
    }
}
