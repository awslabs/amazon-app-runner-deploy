
jest.mock('@actions/core');

const SERVICE_ID = "serviceId";
const SERVICE_URL = "xxxxx.awsapprunner.com";
const SERVICE_NAME = "serviceName";
const SERVICE_ARN = "serviceArn";
const SOURCE_ARN_CONNECTION = "sourceArnConnection";
const ACCESS_ROLE_ARN = "accessRoleArn";
const REPO = "repo";
const DOCKER_IMAGE = "public.ecr.aws/bitnami/node:latest";
const RUNTIME = "NODEJS_12";
const BUILD_COMMAND = "build-command";
const START_COMMAND = "start-command";
const PORT = "80";

const mockSendDef = jest.fn();
jest.mock('@aws-sdk/client-apprunner', () => {
    const appRunnerClient = {
        send: mockSendDef,
    }
    return {
        ...jest.requireActual('@aws-sdk/client-apprunner'),
        AppRunnerClient: jest.fn(() => appRunnerClient),
    }
});

import { mocked } from 'ts-jest/utils';
import { getInput, info, setFailed, setOutput } from '@actions/core';
import { run } from '.';
import { FakeInput, getFakeInput } from './test-helpers/fake-input';
import { CommandLog, getFakeCommandOutput, ICommandConfig } from './test-helpers/app-runner-commands';


describe('Deploy to AppRunner', () => {

    const getInputMock = mocked(getInput);
    const setFailedMock = mocked(setFailed);
    const setOutputMock = mocked(setOutput);
    const infoMock = mocked(info);

    const commandLog = new CommandLog();

    beforeEach(() => {
        commandLog.reset();
    });

    test('register app runner with source code configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            repo: REPO,
            runtime: RUNTIME,
            "build-command": BUILD_COMMAND,
            "start-command": START_COMMAND,
            port: PORT,
            "wait-for-service-stability": 'false',
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        const sendConfig: ICommandConfig = {
            listServicesCommand: [{ NextToken: undefined, ServiceSummaryList: [] }],
            createServiceCommand: [{ Service: { ServiceId: SERVICE_ID, ServiceUrl: SERVICE_URL } }],
        }
        mockSendDef.mockImplementation((command) => {
            return getFakeCommandOutput(sendConfig, command.input, commandLog);
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
    });

    test('register app runner using docker registry configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        const sendConfig: ICommandConfig = {
            listServicesCommand: [{ NextToken: undefined, ServiceSummaryList: [] }],
            createServiceCommand: [{ Service: { ServiceId: SERVICE_ID, ServiceUrl: SERVICE_URL } }],
        }
        mockSendDef.mockImplementation((command) => {
            return getFakeCommandOutput(sendConfig, command.input, commandLog);
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
    });

    test('update app runner', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        const sendConfig: ICommandConfig = {
            listServicesCommand: [{
                NextToken: undefined,
                ServiceSummaryList: [{
                    ServiceName: SERVICE_NAME,
                    ServiceArn: SERVICE_ARN,
                }]
            }],
            updateServiceCommand: [{ Service: { ServiceId: SERVICE_ID, ServiceUrl: SERVICE_URL } }],
        }
        mockSendDef.mockImplementation((command) => {
            return getFakeCommandOutput(sendConfig, command.input, commandLog);
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
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
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        const sendConfig: ICommandConfig = {
            listServicesCommand: [{
                NextToken: undefined,
                ServiceSummaryList: [{
                    ServiceName: SERVICE_NAME,
                    ServiceArn: SERVICE_ARN,
                }]
            }],
            updateServiceCommand: [{ Service: { ServiceId: SERVICE_ID, ServiceUrl: SERVICE_URL } }],
        }
        mockSendDef.mockImplementation((command) => {
            return getFakeCommandOutput(sendConfig, command.input, commandLog);
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
    });

    test('update app runner with pagination', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "access-role-arn": ACCESS_ROLE_ARN,
            image: DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        const sendConfig: ICommandConfig = {
            listServicesCommand: [{
                NextToken: 'NextToken',
            }, {
                NextToken: undefined,
                ServiceSummaryList: [{
                    ServiceName: SERVICE_NAME,
                    ServiceArn: SERVICE_ARN,
                }]
            }],
            updateServiceCommand: [{ Service: { ServiceId: SERVICE_ID, ServiceUrl: SERVICE_URL } }],
        }
        mockSendDef.mockImplementation((command) => {
            return getFakeCommandOutput(sendConfig, command.input, commandLog);
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
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

        const sendConfig: ICommandConfig = {
            listServicesCommand: [{ NextToken: undefined, ServiceSummaryList: [] }],
            createServiceCommand: [{ Service: { ServiceId: SERVICE_ID, ServiceArn: SERVICE_ARN, ServiceUrl: SERVICE_URL } }],
            describeServiceCommand: [{ Service: { Status: "CREATION_COMPLETE" } }],
        };
        mockSendDef.mockImplementation((command) => {
            return getFakeCommandOutput(sendConfig, command.input, commandLog);
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Waiting for the service ${SERVICE_ID} to reach stable state`);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has reached the stable state CREATION_COMPLETE`);
    });

    test('Validation - Service name empty', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            repo: REPO,
            image: DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledTimes(1);
    });

    test('Validation - Docker and source code configuration', async () => {
        getInputMock.mockImplementation((name) => {
            return getFakeInput({}, name);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledTimes(1);
    });

    test('Validation - Source code missing validation', async () => {
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

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledTimes(1);
    });

    test('Validation - Invalid runtime', async () => {
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

        expect(setFailedMock).toHaveBeenCalledTimes(1);
    });

    test('Validation - IAM Role missing', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            image: DOCKER_IMAGE,
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        await run();

        expect(setFailedMock).toHaveBeenCalledTimes(1);
    });

    test('register app runner with branch configuration', async () => {
        const inputConfig: FakeInput = {
            service: SERVICE_NAME,
            "source-connection-arn": SOURCE_ARN_CONNECTION,
            "access-role-arn": ACCESS_ROLE_ARN,
            repo: REPO,
            runtime: RUNTIME,
            "build-command": BUILD_COMMAND,
            "start-command": START_COMMAND,
            port: PORT,
            region: 'us-east-1',
            branch: 'refs/head/master',
        };

        getInputMock.mockImplementation((name) => {
            return getFakeInput(inputConfig, name);
        });

        const sendConfig: ICommandConfig = {
            listServicesCommand: [{ NextToken: undefined, ServiceSummaryList: [] }],
            createServiceCommand: [{ Service: { ServiceId: SERVICE_ID, ServiceUrl: SERVICE_URL } }],
        }
        mockSendDef.mockImplementation((command) => {
            return getFakeCommandOutput(sendConfig, command.input, commandLog);
        });

        await run();

        expect(setFailedMock).not.toHaveBeenCalled();
        expect(setOutputMock).toHaveBeenNthCalledWith(1, 'service-id', SERVICE_ID);
        expect(setOutputMock).toHaveBeenNthCalledWith(2, 'service-url', SERVICE_URL);
        expect(infoMock).toBeCalledWith(`Service ${SERVICE_ID} has started creation. Watch for creation progress in AppRunner console`);
    });
});
