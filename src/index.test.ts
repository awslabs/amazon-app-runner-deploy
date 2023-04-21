/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint no-unused-vars: ["warn", { "argsIgnorePattern": "^_" }] */

import { jest, expect, test, describe } from '@jest/globals';
import { getInput, getMultilineInput, info, setFailed, setOutput } from '@actions/core';
import { run } from '.';
import { FakeInput, FakeMultilineInput, getFakeInput, getFakeMultilineInput } from './test-helpers/fake-input';
import { AppRunnerClient, CreateServiceCommand, DeleteServiceCommand, DescribeServiceCommand, ImageRepositoryType, ListServicesCommand, ServiceStatus, UpdateServiceCommand, TagResourceCommand, ListOperationsCommand, OperationStatus } from '@aws-sdk/client-apprunner';

jest.mock('@actions/core');

const SERVICE_ID = "serviceId";
const SERVICE_URL = "xxxxx.awsapprunner.com";
const SERVICE_NAME = "serviceName";
const SERVICE_ARN = "serviceArn";
const SOURCE_ARN_CONNECTION = "sourceArnConnection";
const ACCESS_ROLE_ARN = "accessRoleArn";
const INSTANCE_ROLE_ARN = "instanceRoleArn";
const AUTO_SCALING_CONFIG_ARN = "autoScalingConfigArn";
const REPO = "repo";
const PUBLIC_DOCKER_IMAGE = "public.ecr.aws/bitnami/node:latest";
const RUNTIME = "NODEJS_16";
const BUILD_COMMAND = "build-command";
const START_COMMAND = "start-command";
const PORT = "80";
const DEFAULT_REGION = 'us-east-1';
const TAGS = '{ "env": "test" }'
const OPERATION_ID = "test-operation-id";

const mockSendDef = jest.fn<typeof AppRunnerClient.prototype.send>();
jest.mock('@aws-sdk/client-apprunner', () => {
    return {
        ...jest.requireActual('@aws-sdk/client-apprunner') as Record<string, unknown>,
        AppRunnerClient: jest.fn(() => {
            return {
                send: mockSendDef,
            };
        }),
    }
});

describe('Input Validation', () => {
    const getInputMock = jest.mocked(getInput);
    const setFailedMock = jest.mocked(setFailed);

    test('cpu must be a number', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            repo: REPO,
            image: PUBLIC_DOCKER_IMAGE,
            cpu: 'not-a-number',
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        await run();
        expect(setFailedMock).toHaveBeenCalledWith('cpu value is not a valid number: not-a-number');
    });

    test('Both Docker image and source code repo provided', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            repo: REPO,
            image: PUBLIC_DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledWith('Either docker image registry or code repository expected, not both');
    });

    test('Start command missing', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            repo: REPO,
            runtime: RUNTIME,
            "build-command": BUILD_COMMAND,
            port: PORT,
            "wait-for-service-stability": 'true',
        };

        getInputMock.mockImplementation((name, options) => {
            return getFakeInput(inputConfig, name, options);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledWith('start-command is required');
    });

    test('Invalid runtime', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            repo: REPO,
            runtime: "RUNTIME",
            "build-command": BUILD_COMMAND,
            "start-command": START_COMMAND,
            port: PORT,
            "wait-for-service-stability": 'true',
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledWith(expect.stringContaining('Specified runtime (RUNTIME) does not belong to the supported range'));
    });

    test('IAM Role missing', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            image: PUBLIC_DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name, options) => {
            return getFakeInput(inputConfig, name, options);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledWith('access-role-arn is required');
    });

    test.each([
        { value: 1, message: 'wait-for-service-stability-seconds value (1) is less then the allowed minimum (10)' },
        { value: 10_000, message: 'wait-for-service-stability-seconds value (10000) is greater then the allowed maximum (3600)' },
    ])('Invalid timeout value', async (arg: { value: number, message: string }) => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: PUBLIC_DOCKER_IMAGE,
            'wait-for-service-stability-seconds': `${arg.value}`,
        };

        getInputMock.mockImplementation((name, options) => {
            return getFakeInput(inputConfig, name, options);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledWith(arg.message);

    });

    test('Unsupported action', async () => {
        const inputConfig: FakeInput = {
            action: 'DO_NOTHING',
        };

        getInputMock.mockImplementation((name, options) => {
            return getFakeInput(inputConfig, name, options);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledWith('Unsupported action: DO_NOTHING');
    });
});

describe('Exception Handling', () => {
    const getInputMock = jest.mocked(getInput);
    const setFailedMock = jest.mocked(setFailed);

    test('unhandled exception object logged as JSON', async () => {
        getInputMock.mockImplementation(() => {
            throw {
                Data: "some custom data",
                SomeValue: 123,
            };
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledWith("{\"Data\":\"some custom data\",\"SomeValue\":123}");
    });

});

describe('Deploy to AppRunner', () => {

    const getInputMock = jest.mocked(getInput);
    const getMultilineInputMock = jest.mocked(getMultilineInput);
    const setFailedMock = jest.mocked(setFailed);
    const setOutputMock = jest.mocked(setOutput);
    const infoMock = jest.mocked(info);
    const appRunnerClientMock = jest.mocked(AppRunnerClient);

    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = {
            ...originalEnv,
            TEST_ENV_VAR: 'test env var value',
            TEST_SECRET_ENV_VAR: '/test/secret_env'
        };
    });
    afterEach(() => {
        process.env = originalEnv;
    });

    test('register app runner with source code configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            "instance-role-arn": INSTANCE_ROLE_ARN,
            repo: REPO,
            runtime: RUNTIME,
            "build-command": BUILD_COMMAND,
            "start-command": START_COMMAND,
            port: PORT,
            "wait-for-service-stability": 'false',
            tags: TAGS,
        };

        const multiLineInputConfig: FakeMultilineInput = {
            'copy-env-vars': ['TEST_ENV_VAR'],
            'copy-secret-env-vars': ['TEST_SECRET_ENV_VAR'],
        }

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput(multiLineInputConfig, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({ NextToken: undefined, ServiceSummaryList: [] });
        });

        mockSendDef.mockImplementationOnce(async (cmd: CreateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceName: SERVICE_NAME, // create command requires service name
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                    InstanceRoleArn: INSTANCE_ROLE_ARN,
                },
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        ConnectionArn: SOURCE_ARN_CONNECTION,
                    },
                    AutoDeploymentsEnabled: true,
                    CodeRepository: {
                        RepositoryUrl: REPO,
                        SourceCodeVersion: {
                            Type: 'BRANCH',
                            Value: 'main',
                        },
                        CodeConfiguration: {
                            ConfigurationSource: 'API',
                            CodeConfigurationValues: {
                                Runtime: RUNTIME,
                                BuildCommand: BUILD_COMMAND,
                                StartCommand: START_COMMAND,
                                Port: PORT,
                                RuntimeEnvironmentVariables: {
                                    TEST_ENV_VAR: 'test env var value',
                                },
                                RuntimeEnvironmentSecrets: {
                                    TEST_SECRET_ENV_VAR: '/test/secret_env'
                                }
                            },
                        },
                    },
                },
                Tags: [{ Key: 'env', Value: 'test' }],
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL } });
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started an update. Watch for its progress in the AppRunner console`);
    });

    test('register app runner with non-default configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            'source-connection-arn': SOURCE_ARN_CONNECTION,
            'access-role-arn': ACCESS_ROLE_ARN,
            repo: REPO,
            runtime: 'PYTHON_3',
            'build-command': BUILD_COMMAND,
            'start-command': START_COMMAND,
            port: '8443',
            region: 'us-west-2',
            branch: 'refs/head/release',
            cpu: '3',
            memory: '5',
            tags: TAGS,
            'auto-scaling-config-arn': AUTO_SCALING_CONFIG_ARN,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput({} as FakeMultilineInput, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({
                NextToken: undefined,
                ServiceSummaryList: []
            });
        });
        mockSendDef.mockImplementationOnce(async (cmd: CreateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceName: SERVICE_NAME, // create command requires service name
                InstanceConfiguration: {
                    Cpu: `3 vCPU`,
                    Memory: `5 GB`,
                },
                AutoScalingConfigurationArn: AUTO_SCALING_CONFIG_ARN,
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        ConnectionArn: SOURCE_ARN_CONNECTION,
                    },
                    AutoDeploymentsEnabled: true,
                    CodeRepository: {
                        RepositoryUrl: REPO,
                        SourceCodeVersion: {
                            Type: 'BRANCH',
                            Value: 'release',
                        },
                        CodeConfiguration: {
                            ConfigurationSource: 'API',
                            CodeConfigurationValues: {
                                Runtime: 'PYTHON_3',
                                BuildCommand: BUILD_COMMAND,
                                StartCommand: START_COMMAND,
                                Port: '8443',
                                RuntimeEnvironmentVariables: undefined,
                                RuntimeEnvironmentSecrets: undefined,
                            },
                        },
                    },
                },
                Tags: [{ Key: 'env', Value: 'test' }],
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL } });
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: 'us-west-2' });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started an update. Watch for its progress in the AppRunner console`);
    });

    test('register app and wait for stable state', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            repo: REPO,
            runtime: RUNTIME,
            "build-command": BUILD_COMMAND,
            "start-command": START_COMMAND,
            port: PORT,
            "wait-for-service-stability": 'true',
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput({} as FakeMultilineInput, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({
                NextToken: undefined,
                ServiceSummaryList: []
            });
        });
        mockSendDef.mockImplementationOnce(async (cmd: CreateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceName: SERVICE_NAME, // create command requires service name
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                },
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        ConnectionArn: SOURCE_ARN_CONNECTION,
                    },
                    AutoDeploymentsEnabled: true,
                    CodeRepository: {
                        RepositoryUrl: REPO,
                        SourceCodeVersion: {
                            Type: 'BRANCH',
                            Value: 'main',
                        },
                        CodeConfiguration: {
                            ConfigurationSource: 'API',
                            CodeConfigurationValues: {
                                Runtime: RUNTIME,
                                BuildCommand: BUILD_COMMAND,
                                StartCommand: START_COMMAND,
                                Port: PORT,
                                RuntimeEnvironmentVariables: undefined,
                                RuntimeEnvironmentSecrets: undefined,
                            },
                        },
                    },
                },
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL } });
        });
        mockSendDef.mockImplementationOnce(async (cmd: DescribeServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN,
            });
            return { Service: { Status: ServiceStatus.RUNNING } };
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Waiting for ${SERVICE_ARN} to reach stable state`);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ARN} has reached the stable state ${ServiceStatus.RUNNING}`);
    });

    test('update app runner with source code configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            repo: REPO,
            runtime: RUNTIME,
            "build-command": BUILD_COMMAND,
            "start-command": START_COMMAND,
            port: PORT,
            "wait-for-service-stability": 'false',
            tags: TAGS,
            'auto-scaling-config-arn': AUTO_SCALING_CONFIG_ARN,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput({} as FakeMultilineInput, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({
                NextToken: undefined,
                ServiceSummaryList: [{
                    ServiceName: SERVICE_NAME,
                    ServiceArn: SERVICE_ARN,
                    Status: ServiceStatus.RUNNING,
                }]
            });
        });
        mockSendDef.mockImplementationOnce(async (cmd: TagResourceCommand) => {
            expect(cmd.input).toMatchObject({
                ResourceArn: SERVICE_ARN, // tag resource command requires service arn
                Tags: [{ Key: 'env', Value: 'test' }],
            })
            return
        })
        mockSendDef.mockImplementationOnce(async (cmd: UpdateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN, // update command requires service arn
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                },
                AutoScalingConfigurationArn: AUTO_SCALING_CONFIG_ARN,
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        ConnectionArn: SOURCE_ARN_CONNECTION,
                    },
                    AutoDeploymentsEnabled: true,
                    CodeRepository: {
                        RepositoryUrl: REPO,
                        SourceCodeVersion: {
                            Type: 'BRANCH',
                            Value: 'main',
                        },
                        CodeConfiguration: {
                            ConfigurationSource: 'API',
                            CodeConfigurationValues: {
                                Runtime: RUNTIME,
                                BuildCommand: BUILD_COMMAND,
                                StartCommand: START_COMMAND,
                                Port: PORT,
                                RuntimeEnvironmentVariables: undefined,
                                RuntimeEnvironmentSecrets: undefined,
                            },
                        },
                    },
                },
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL }, OperationId: OPERATION_ID });
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started an update. Watch for its progress in the AppRunner console`);
    });

    test('register app runner using docker registry configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: PUBLIC_DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput({} as FakeMultilineInput, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({ NextToken: undefined, ServiceSummaryList: [] });
        });
        mockSendDef.mockImplementationOnce(async (cmd: CreateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceName: SERVICE_NAME, // create command requires service name
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                },
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        AccessRoleArn: ACCESS_ROLE_ARN,
                    },
                    ImageRepository: {
                        ImageIdentifier: PUBLIC_DOCKER_IMAGE,
                        ImageRepositoryType: ImageRepositoryType.ECR_PUBLIC,
                        ImageConfiguration: {
                            Port: PORT,
                            RuntimeEnvironmentVariables: undefined,
                            RuntimeEnvironmentSecrets: undefined,
                        },
                    },
                },
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL } });
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started an update. Watch for its progress in the AppRunner console`);
    });

    test('register app runner using private docker registry configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: '811284229777.dkr.ecr.us-east-1.amazonaws.com/blazingtext:1',
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput({} as FakeMultilineInput, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({ NextToken: undefined, ServiceSummaryList: [] });
        });
        mockSendDef.mockImplementationOnce(async (cmd: CreateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceName: SERVICE_NAME, // create command requires service name
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                },
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        AccessRoleArn: ACCESS_ROLE_ARN,
                    },
                    ImageRepository: {
                        ImageIdentifier: '811284229777.dkr.ecr.us-east-1.amazonaws.com/blazingtext:1',
                        ImageRepositoryType: ImageRepositoryType.ECR,
                        ImageConfiguration: {
                            Port: PORT,
                            RuntimeEnvironmentVariables: undefined,
                            RuntimeEnvironmentSecrets: undefined,
                        },
                    },
                },
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL } });
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started an update. Watch for its progress in the AppRunner console`);
    });

    test('update app runner using docker registry configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            "instance-role-arn": INSTANCE_ROLE_ARN,
            image: PUBLIC_DOCKER_IMAGE,
        };
        const multiLineInputConfig = {
            'copy-env-vars': ['_NON_EXISTENT_VAR_'],
            'copy-secret-env-vars': ['_NON_EXISTENT_SECRET_VAR_']
        }

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput(multiLineInputConfig, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({
                NextToken: undefined,
                ServiceSummaryList: [{
                    ServiceName: SERVICE_NAME,
                    ServiceArn: SERVICE_ARN,
                    Status: ServiceStatus.RUNNING,
                }]
            });
        });
        mockSendDef.mockImplementationOnce(async (cmd: UpdateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN, // update command requires service arn
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                    InstanceRoleArn: INSTANCE_ROLE_ARN,
                },
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        AccessRoleArn: ACCESS_ROLE_ARN,
                    },
                    ImageRepository: {
                        ImageIdentifier: PUBLIC_DOCKER_IMAGE,
                        ImageRepositoryType: ImageRepositoryType.ECR_PUBLIC,
                        ImageConfiguration: {
                            Port: PORT,
                            RuntimeEnvironmentVariables: undefined,
                            RuntimeEnvironmentSecrets: undefined,
                        },
                    },
                },
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL }, OperationId: OPERATION_ID });
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started an update. Watch for its progress in the AppRunner console`);
    });

    test('update app runner with pagination', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: PUBLIC_DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput({} as FakeMultilineInput, name);
        });

        const nextToken = 'next-token';
        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({
                NextToken: nextToken,
            });
        });
        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toEqual(nextToken);
            return ({
                NextToken: undefined,
                ServiceSummaryList: [{
                    ServiceName: SERVICE_NAME,
                    ServiceArn: SERVICE_ARN,
                    Status: ServiceStatus.RUNNING,
                }]
            });
        });
        mockSendDef.mockImplementationOnce(async (cmd: UpdateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN, // update command requires service arn
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                },
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        AccessRoleArn: ACCESS_ROLE_ARN,
                    },
                    ImageRepository: {
                        ImageIdentifier: PUBLIC_DOCKER_IMAGE,
                        ImageRepositoryType: ImageRepositoryType.ECR_PUBLIC,
                        ImageConfiguration: {
                            Port: PORT,
                            RuntimeEnvironmentVariables: undefined,
                            RuntimeEnvironmentSecrets: undefined,
                        },
                    },
                },
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL }, OperationId: OPERATION_ID });
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started an update. Watch for its progress in the AppRunner console`);
    });

    test('update app runner with service rollback', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: PUBLIC_DOCKER_IMAGE,
            "wait-for-service-stability": 'true',
        };
        const multiLineInputConfig = {
            'copy-env-vars': ['_NON_EXISTENT_VAR_'],
            'copy-secret-env-vars': ['_NON_EXISTENT_SECRET_VAR_']
        }

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput(multiLineInputConfig, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({
                NextToken: undefined,
                ServiceSummaryList: [{
                    ServiceName: SERVICE_NAME,
                    ServiceArn: SERVICE_ARN,
                    Status: ServiceStatus.RUNNING,
                }]
            });
        });
        mockSendDef.mockImplementationOnce(async (cmd: UpdateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN, // update command requires service arn
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                },
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        AccessRoleArn: ACCESS_ROLE_ARN,
                    },
                    ImageRepository: {
                        ImageIdentifier: PUBLIC_DOCKER_IMAGE,
                        ImageRepositoryType: ImageRepositoryType.ECR_PUBLIC,
                        ImageConfiguration: {
                            Port: PORT,
                            RuntimeEnvironmentVariables: undefined,
                            RuntimeEnvironmentSecrets: undefined,
                        },
                    },
                },
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL }, OperationId: OPERATION_ID });
        });
        mockSendDef.mockImplementationOnce(async (cmd: DescribeServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN,
            });
            return { Service: { Status: ServiceStatus.RUNNING } };
        });
        mockSendDef.mockImplementationOnce(async (cmd: ListOperationsCommand) => {
            expect(cmd.input).toMatchObject({
              ServiceArn: SERVICE_ARN,
            })
            return ({ OperationSummaryList: [ { Id: OPERATION_ID, Status: OperationStatus.FAILED }] })
        });

        await run();

        expect(setFailedMock).toBeCalledWith(`Operation ${OPERATION_ID} is not successful. Its current status is ${OperationStatus.FAILED}`)
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
    })

    test('existing CREATE_FAILED service is deleted first', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: PUBLIC_DOCKER_IMAGE,
        };
        const multiLineInputConfig = {
            'copy-env-vars': ['_NON_EXISTENT_VAR_'],
            'copy-secret-env-vars': ['_NON_EXISTENT_SECRET_VAR_'],
        }

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });
        getMultilineInputMock.mockImplementation((name) => {
            return getFakeMultilineInput(multiLineInputConfig, name);
        });

        mockSendDef.mockImplementationOnce(async (cmd: ListServicesCommand) => {
            expect(cmd.input.NextToken).toBeUndefined();
            return ({
                NextToken: undefined,
                ServiceSummaryList: [{
                    ServiceName: SERVICE_NAME,
                    ServiceArn: SERVICE_ARN,
                    Status: ServiceStatus.CREATE_FAILED,
                }]
            });
        });
        mockSendDef.mockImplementationOnce(async (cmd: DeleteServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN,
            });
            return ({});
        });
        mockSendDef.mockImplementationOnce(async (cmd: DescribeServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN,
            });
            return { Service: { Status: ServiceStatus.OPERATION_IN_PROGRESS } }; // simulate delay
        });
        mockSendDef.mockImplementationOnce(async (cmd: DescribeServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceArn: SERVICE_ARN,
            });
            return { Service: { Status: ServiceStatus.DELETED } };
        });
        mockSendDef.mockImplementationOnce(async (cmd: CreateServiceCommand) => {
            expect(cmd.input).toMatchObject({
                ServiceName: SERVICE_NAME, // create command requires service name
                InstanceConfiguration: {
                    Cpu: `1 vCPU`,
                    Memory: `2 GB`,
                },
                SourceConfiguration: {
                    AuthenticationConfiguration: {
                        AccessRoleArn: ACCESS_ROLE_ARN,
                    },
                    ImageRepository: {
                        ImageIdentifier: PUBLIC_DOCKER_IMAGE,
                        ImageRepositoryType: ImageRepositoryType.ECR_PUBLIC,
                        ImageConfiguration: {
                            Port: PORT,
                            RuntimeEnvironmentVariables: undefined,
                            RuntimeEnvironmentSecrets: undefined,
                        },
                    },
                },
            });
            return ({ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL } });
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(appRunnerClientMock.mock.calls).toHaveLength(1);
        expect(appRunnerClientMock.mock.calls[0][0]).toMatchObject({ region: DEFAULT_REGION });
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-arn', SERVICE_ARN);
        expect(setOutputMock).toHaveBeenNthCalledWith(3, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started an update. Watch for its progress in the AppRunner console`);
    });
});
