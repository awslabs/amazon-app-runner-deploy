import { InputOptions } from "@actions/core";

export interface FakeInput {
    action?: string;
    service?: string;
    'source-connection-arn'?: string;
    'access-role-arn'?: string;
    'instance-role-arn'?: string;
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
    tags?: string;
    'auto-scaling-config-arn'?: string;
}

export interface FakeMultilineInput {
    'copy-env-vars'?: string[];
    'copy-secret-env-vars'?: string[];
}

export function getFakeMultilineInput(config: FakeMultilineInput, name: string, options?: InputOptions): string[] {
    if (Object.keys(config).includes(name)) {
        return (config as { [key: string]: string[] })[name];
    } else {
        if (options?.required) {
            throw new Error(`${name} is required`);
        } else {
            return [];
        }
    }
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
