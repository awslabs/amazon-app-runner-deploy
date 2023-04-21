import { CreateServiceCommand, DeleteServiceCommand, DescribeServiceCommand, ImageRepositoryType, ListServicesCommand, SourceConfiguration, UpdateServiceCommand, TagResourceCommand, ListOperationsCommand } from "@aws-sdk/client-apprunner";
import { ICodeConfiguration, ICreateOrUpdateActionParams, IImageConfiguration } from "./action-configuration";

export function getCreateCommand(config: ICreateOrUpdateActionParams): CreateServiceCommand {
    return new CreateServiceCommand({
        ServiceName: config.serviceName,
        InstanceConfiguration: {
            Cpu: `${config.cpu} vCPU`,
            Memory: `${config.memory} GB`,
            InstanceRoleArn: config.instanceRoleArn,
        },
        AutoScalingConfigurationArn: config.autoScalingConfigArn,
        SourceConfiguration: (config.sourceConfig.sourceType == 'image')
            ? getImageSourceConfiguration(config.port, config.sourceConfig, config.environment, config.environmentSecret)
            : getCodeSourceConfiguration(config.port, config.sourceConfig, config.environment, config.environmentSecret),
        Tags: config.tags,
    });
}

export function getUpdateCommand(serviceArn: string, config: ICreateOrUpdateActionParams): UpdateServiceCommand {
    return new UpdateServiceCommand({
        ServiceArn: serviceArn,
        InstanceConfiguration: {
            Cpu: `${config.cpu} vCPU`,
            Memory: `${config.memory} GB`,
            InstanceRoleArn: config.instanceRoleArn,
        },
        AutoScalingConfigurationArn: config.autoScalingConfigArn,
        SourceConfiguration: (config.sourceConfig.sourceType == 'image')
            ? getImageSourceConfiguration(config.port, config.sourceConfig, config.environment, config.environmentSecret)
            : getCodeSourceConfiguration(config.port, config.sourceConfig, config.environment, config.environmentSecret),
    });
}

export function getTagResourceCommand(serviceArn: string, config: ICreateOrUpdateActionParams): TagResourceCommand {
  return new TagResourceCommand({
    ResourceArn: serviceArn,
    Tags: config.tags,
  })
}

export function getDeleteCommand(serviceArn: string): DeleteServiceCommand {
    return new DeleteServiceCommand({
        ServiceArn: serviceArn,
    });
}

export function getDescribeCommand(serviceArn: string): DescribeServiceCommand {
    return new DescribeServiceCommand({
        ServiceArn: serviceArn,
    });
}

export function getListCommand(nextToken?: string): ListServicesCommand {
    return new ListServicesCommand({
        NextToken: nextToken,
    });
}

export function getListOperationsCommand(serviceArn: string): ListOperationsCommand {
    return new ListOperationsCommand({
        ServiceArn: serviceArn,
    });
}

// Determine ECR image repository type
function getImageType(imageUri: string): ImageRepositoryType {
    return imageUri.startsWith("public.ecr") ? ImageRepositoryType.ECR_PUBLIC : ImageRepositoryType.ECR
}

function getCodeSourceConfiguration(port: number, config: ICodeConfiguration, runtimeEnvironmentVariables?: Record<string, string>, runtimeEnvironmentSecrets?: Record<string, string>): SourceConfiguration {
    return {
        AuthenticationConfiguration: {
            ConnectionArn: config.sourceConnectionArn,
        },
        AutoDeploymentsEnabled: true,
        CodeRepository: {
            RepositoryUrl: config.repoUrl,
            SourceCodeVersion: {
                Type: 'BRANCH',
                Value: config.branch,
            },
            CodeConfiguration: {
                ConfigurationSource: 'API',
                CodeConfigurationValues: {
                    Runtime: config.runtime,
                    BuildCommand: config.buildCommand,
                    StartCommand: config.startCommand,
                    Port: `${port}`,
                    RuntimeEnvironmentVariables: runtimeEnvironmentVariables,
                    RuntimeEnvironmentSecrets: runtimeEnvironmentSecrets,
                },
            },
        },
    };
}

function getImageSourceConfiguration(port: number, config: IImageConfiguration, runtimeEnvironmentVariables?: Record<string, string>, runtimeEnvironmentSecrets?: Record<string, string>): SourceConfiguration {
    return {
        AuthenticationConfiguration: {
            AccessRoleArn: config.accessRoleArn
        },
        ImageRepository: {
            ImageIdentifier: config.imageUri,
            ImageRepositoryType: getImageType(config.imageUri),
            ImageConfiguration: {
                Port: `${port}`,
                RuntimeEnvironmentVariables: runtimeEnvironmentVariables,
                RuntimeEnvironmentSecrets: runtimeEnvironmentSecrets,
            }
        }
    };
}
