import { CreateServiceCommand, DeleteServiceCommand, DescribeServiceCommand, ImageRepositoryType, ListServicesCommand, SourceConfiguration, UpdateServiceCommand } from "@aws-sdk/client-apprunner";
import { ICodeConfiguration, ICreateOrUpdateActionParams, IImageConfiguration } from "./action-configuration";

export function getCreateCommand(config: ICreateOrUpdateActionParams): CreateServiceCommand {
    return new CreateServiceCommand({
        ServiceName: config.serviceName,
        InstanceConfiguration: {
            Cpu: `${config.cpu} vCPU`,
            Memory: `${config.memory} GB`,
        },
        SourceConfiguration: (config.sourceConfig.sourceType == 'image')
            ? getImageSourceConfiguration(config.port, config.sourceConfig, config.environment)
            : getCodeSourceConfiguration(config.port, config.sourceConfig, config.environment),
    });
}

export function getUpdateCommand(serviceArn: string, config: ICreateOrUpdateActionParams): UpdateServiceCommand {
    return new UpdateServiceCommand({
        ServiceArn: serviceArn,
        InstanceConfiguration: {
            Cpu: `${config.cpu} vCPU`,
            Memory: `${config.memory} GB`,
        },
        SourceConfiguration: (config.sourceConfig.sourceType == 'image')
            ? getImageSourceConfiguration(config.port, config.sourceConfig, config.environment)
            : getCodeSourceConfiguration(config.port, config.sourceConfig, config.environment),
    });
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

// Determine ECR image repository type
function getImageType(imageUri: string) {
    return imageUri.startsWith("public.ecr") ? ImageRepositoryType.ECR_PUBLIC : ImageRepositoryType.ECR
}

function getCodeSourceConfiguration(port: number, config: ICodeConfiguration, runtimeEnvironmentVariables?: Record<string, string>): SourceConfiguration {
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
                },
            },
        },
    };
}

function getImageSourceConfiguration(port: number, config: IImageConfiguration, runtimeEnvironmentVariables?: Record<string, string>): SourceConfiguration {
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
            }
        }
    };
}
