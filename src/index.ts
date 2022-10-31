
import { info, setFailed, setOutput } from "@actions/core";
import { AppRunnerClient, ListServicesCommand, ListServicesCommandOutput, DescribeServiceCommand, Service } from "@aws-sdk/client-apprunner";
import { debug } from '@actions/core';
import { getConfig, IActionParams } from "./configuration";
import { getCreateCommand, getUpdateCommand } from "./commands";

const OPERATION_IN_PROGRESS = "OPERATION_IN_PROGRESS";
const MAX_ATTEMPTS = 120;

// Wait in milliseconds (helps to implement exponential retries)
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getServiceArn(client: AppRunnerClient, serviceName: string): Promise<string | undefined> {

    let nextToken: string | undefined = undefined;

    do {
        const listServiceResponse: ListServicesCommandOutput = await client.send(
            new ListServicesCommand({
                NextToken: nextToken,
            })
        );
        nextToken = listServiceResponse.NextToken;

        if (listServiceResponse.ServiceSummaryList) {
            for (const service of listServiceResponse.ServiceSummaryList) {
                if (service.ServiceName === serviceName) {
                    return service.ServiceArn
                }
            }
        }
    } while (nextToken)

    return undefined;
}

async function createOrUpdateService(client: AppRunnerClient, config: IActionParams, serviceArn?: string): Promise<Service | undefined> {
    if (!serviceArn) {
        info(`Creating service ${config.serviceName}`);
        const command = getCreateCommand(config);
        const createServiceResponse = await client.send(command);
        return createServiceResponse.Service;
    } else {
        info(`Updating existing service ${config.serviceName}`);
        const command = getUpdateCommand(serviceArn, config);
        const updateServiceResponse = await client.send(command);
        return updateServiceResponse.Service;
    }
}

async function waitToStabilize(client: AppRunnerClient, serviceId: string, serviceArn: string, timeoutSeconds: number): Promise<void> {
    let elapsedSeconds = 0;
    let status = OPERATION_IN_PROGRESS;
    info(`Waiting for the service ${serviceId} to reach stable state`);
    while (status === OPERATION_IN_PROGRESS && elapsedSeconds < timeoutSeconds) {
        const describeServiceResponse = await client.send(new DescribeServiceCommand({
            ServiceArn: serviceArn
        }));

        status = describeServiceResponse.Service?.Status ?? OPERATION_IN_PROGRESS;
        if (status !== OPERATION_IN_PROGRESS) {
            info(`Service ${serviceId} has reached the stable state ${status}`);
            return;
        }

        // Wait for 1 second and re-try
        await sleep(1000);
        ++elapsedSeconds;
    }

    throw new Error(`Service did not reach stable state after ${elapsedSeconds} seconds`);
}

export async function run(): Promise<void> {

    try {

        const config = getConfig();

        // AppRunner client
        const client = new AppRunnerClient({ region: config.region });

        // Check whether service exists and get ServiceArn
        const existingServiceArn = await getServiceArn(client, config.serviceName);

        const service = await createOrUpdateService(client, config, existingServiceArn);
        if (!service) {
            setFailed(`Failed to create or update service ${config.serviceName} - App Runner Client returned an empty response`);
            return;
        }

        const serviceId = service.ServiceId;
        if (!serviceId) {
            setFailed(`App Runner Client returned an empty ServiceId for ${config.serviceName}`);
            return;
        } else {
            info(`Service ID: ${serviceId}`);
        }

        const serviceArn = service.ServiceArn;
        if (!serviceArn) {
            setFailed(`App Runner Client returned an empty ServiceArn for ${config.serviceName}`);
            return;
        } else {
            info(`Service ARN: ${serviceArn}`);
        }

        // Set output
        setOutput('service-id', serviceId);
        setOutput('service-arn', serviceArn);
        setOutput('service-url', service.ServiceUrl);

        // Wait for service to be stable (if required)
        if (config.waitForService) {
            await waitToStabilize(client, serviceId, serviceArn, MAX_ATTEMPTS * 5);
        } else {
            info(`Service ${service.ServiceId} has started an update. Watch for its progress in the AppRunner console`);
        }
    } catch (error) {
        if (error instanceof Error) {
            setFailed(error.message);
            debug(error.stack ?? 'no stack info');
        } else {
            setFailed(JSON.stringify(error));
        }
    }
}

if (require.main === module) {
    run().then(() => {
        info('App Runner step - DONE!');
    }).catch(err => {
        setFailed(`App Runner unhandled exception: ${err.message}`);
    });
}
