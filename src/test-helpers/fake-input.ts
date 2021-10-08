
export interface FakeInput {
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
    region?: string;
    branch?: string;
    cpu?: string;
    memory?: string;
}

export function getFakeInput(config: FakeInput, name: string): string {
    if (Object.keys(config).includes(name)) {
        return (config as { [key: string]: string })[name];
    } else {
        return '';
    }
}
