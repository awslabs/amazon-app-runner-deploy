import { getInput, getMultilineInput, InputOptions } from "@actions/core";
import { Runtime, Tag } from "@aws-sdk/client-apprunner";

// supported GitHub action modes
enum Actions {
    // Create a new service or update an existing one
    CreateOrUpdate = 'create_or_update',
}

export interface ICodeConfiguration {
    sourceType: 'code';
    repoUrl: string;
    branch: string;
    sourceConnectionArn: string;
    runtime: Runtime;
    buildCommand: string;
    startCommand: string;
}

export interface IImageConfiguration {
    sourceType: 'image';
    imageUri: string;
    accessRoleArn: string;
}

export interface ICreateOrUpdateActionParams {
    action: Actions.CreateOrUpdate;
    serviceName: string;
    sourceConfig: ICodeConfiguration | IImageConfiguration;
    port: number;
    waitForService: boolean;
    waitTimeout: number;
    region: string;
    cpu: number;
    memory: number;
    environment?: Record<string, string>;
    environmentSecret?: Record<string, string>;
    tags: Tag[]
    autoScalingConfigArn?: string;
    instanceRoleArn?: string;
}

export type IActionParams = ICreateOrUpdateActionParams;

interface IValidationRules {
    min?: number;
    max?: number;
}

function getOptionalInputInt(name: string, validation?: IValidationRules): number | undefined {
    const val = getInput(name, { required: false, trimWhitespace: true });
    if (!val) {
        return undefined;
    }

    const result = Number.parseInt(val);

    if (isNaN(result)) {
        throw new Error(`${name} value is not a valid number: ${val}`);
    }

    if (validation?.min && validation.min > result) {
        throw new Error(`${name} value (${result}) is less then the allowed minimum (${validation.min})`);
    }

    if (validation?.max && validation.max < result) {
        throw new Error(`${name} value (${result}) is greater then the allowed maximum (${validation.max})`);
    }

    return result;
}

function getInputInt(name: string, defaultValue: number, validation?: IValidationRules): number {
    return getOptionalInputInt(name, validation) ?? defaultValue;
}

function getInputStr(name: string, defaultValue: string): string {
    return getInput(name, { required: false, trimWhitespace: true }) || defaultValue;
}

function getOptionalInputStr(name: string, options?: InputOptions): string | undefined {
    const value = getInput(name, { required: false, ...options })
    return (value.length > 0) ? value : undefined
}

function getInputBool(name: string, defaultValue: boolean): boolean {
    const val = getInput(name, { required: false, trimWhitespace: true });
    if (!val) {
        return defaultValue;
    }

    return ['1', 'true'].includes(val.toLowerCase());
}

export function getConfig(): IActionParams {
    const rawActionInput = getInput('action', { required: false, trimWhitespace: true });

    switch (rawActionInput.toLowerCase() || Actions.CreateOrUpdate) {
        case Actions.CreateOrUpdate:
            return getCreateOrUpdateConfig();
        default:
            throw new Error(`Unsupported action: ${rawActionInput}`);
    }
}

function getCreateOrUpdateConfig(): ICreateOrUpdateActionParams {
    const action = Actions.CreateOrUpdate;
    // Service name - required input with no default value
    const serviceName = getInput('service', { required: true, trimWhitespace: true });

    // Port number - 80
    const port = getInputInt('port', 80);

    // Region - us-east-1
    const region = getInputStr('region', 'us-east-1');

    // Wait for service to complete the creation/update - false
    const waitForService = getInputBool('wait-for-service-stability', false);
    const waitTimeout = getOptionalInputInt('wait-for-service-stability-seconds', { min: 10, max: 3600 });

    // CPU - 1 vCPU
    const cpu = getInputInt('cpu', 1);

    // Memory - 2GB
    const memory = getInputInt('memory', 2);

    // Source docker image URL - this will switch between deploying source code or docker image
    const imageUri = getInput('image', { required: false, trimWhitespace: true });

    const envVarNames = getMultilineInput('copy-env-vars', { required: false });

    const secretEnvVarNames = getMultilineInput('copy-secret-env-vars', { required: false });

    const tags = getInput('tags', { required: false })

    const autoScalingConfigArn = getOptionalInputStr('auto-scaling-config-arn', { trimWhitespace: true });

    const instanceRoleArn = getOptionalInputStr('instance-role-arn', { trimWhitespace: true });

    return {
        action,
        serviceName,
        region,
        port,
        waitForService: waitForService || !!waitTimeout,
        waitTimeout: waitTimeout ?? 600,
        cpu,
        memory,
        sourceConfig: imageUri ? getImageConfig(imageUri) : getSourceCodeConfig(),
        environment: getEnvironmentVariables(envVarNames),
        environmentSecret: getEnvironmentVariables(secretEnvVarNames),
        tags: getTags(tags),
        autoScalingConfigArn: autoScalingConfigArn,
        instanceRoleArn: instanceRoleArn,
    };
}

function getBranch(): string {
    // Breaking change - default branch name switched to `main`!!!
    const branch = getInput('branch', { required: false }) || 'main';

    return (branch.startsWith("refs/")) ? branch.split("/")[2] : branch;
}

function getImageConfig(imageUri: string): IImageConfiguration {
    if (getInput('repo', { required: false })) {
        throw new Error('Either docker image registry or code repository expected, not both');
    }
    return {
        sourceType: 'image',
        imageUri,
        accessRoleArn: getInput('access-role-arn', { required: true }),
    };
}

function getSourceCodeConfig(): ICodeConfiguration {
    return {
        sourceType: 'code',
        sourceConnectionArn: getInput('source-connection-arn', { required: true }),
        repoUrl: getInput('repo', { required: true }),
        branch: getBranch(),
        runtime: getRuntime(),
        buildCommand: getInput('build-command', { required: true }),
        startCommand: getInput('start-command', { required: true }),
    }
}

function getRuntime(): Runtime {
    const rawRuntime = getInput('runtime', { required: true });
    const runtime = rawRuntime.toUpperCase();
    if (!Object.keys(Runtime).includes(runtime)) {
        throw new Error(`Specified runtime (${rawRuntime}) does not belong to the supported range: ${JSON.stringify(Object.keys(Runtime))}`);
    }

    return Runtime[<keyof typeof Runtime>runtime];
}

function getEnvironmentVariables(envVarNames: string[]): Record<string, string> | undefined {
    if (envVarNames.length > 0) {
        const mapped = envVarNames.reduce((acc: Record<string, string>, env) => {
            const envVarValue = process.env[env];
            if (envVarValue !== undefined) {
                acc[env] = envVarValue;
            }
            return acc;
        }, {});
        if (Object.keys(mapped).length > 0) {
            return mapped;
        }
    }
}

function getTags(tags: string): Tag[] {
  if (!tags.length) {
    return []
  }

  const parsed = JSON.parse(tags);
  return Object.keys(parsed).reduce((acc, tagKey) => {
    return [
      ...acc,
      {
        Key: tagKey,
        Value: parsed[tagKey]
      }
    ]
  }, [] as Tag[])
}
