import { info } from "@actions/core";
import { AppRunnerClient, DescribeServiceCommand, ListServicesCommand, ListServicesCommandOutput, Service } from "@aws-sdk/client-apprunner";
import { IActionParams } from "./action-configuration";
import { getCreateCommand, getUpdateCommand } from "./client-apprunner-commands";

// Service status name for the "In progress..." state
const OPERATION_IN_PROGRESS = "OPERATION_IN_PROGRESS";

// Core service attributes to be returned to the calling GitHub action handler code
export interface IServiceInfo {
    ServiceId: string;
    ServiceArn: string;
    ServiceUrl: string;
}

// Wait in milliseconds (helps to implement exponential retries)
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Get the existing service ARN or undefined, if there is no existing service
export async function getServiceArn(client: AppRunnerClient, serviceName: string): Promise<string | undefined> {

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

// Create a new service
async function createService(client: AppRunnerClient, config: IActionParams): Promise<Service | undefined> {
    info(`Creating service ${config.serviceName}`);
    const command = getCreateCommand(config);
    const createServiceResponse = await client.send(command);
    return createServiceResponse.Service;
}

// Update an existing service
async function updateService(client: AppRunnerClient, config: IActionParams, serviceArn: string): Promise<Service | undefined> {
    info(`Updating existing service ${config.serviceName}`);
    const command = getUpdateCommand(serviceArn, config);
    const updateServiceResponse = await client.send(command);
    return updateServiceResponse.Service;
}

// Create or update an existing service, depending on whether it already exists
export async function createOrUpdateService(client: AppRunnerClient, config: IActionParams, existingServiceArn?: string): Promise<IServiceInfo> {
    const service = (!existingServiceArn) ? await createService(client, config) : await updateService(client, config, existingServiceArn);

    if (!service) {
        throw new Error(`Failed to create or update service ${config.serviceName} - App Runner Client returned an empty response`);
    }

    const serviceId = service.ServiceId;
    if (!serviceId) {
        throw new Error(`App Runner Client returned an empty ServiceId for ${config.serviceName}`);
    } else {
        info(`Service ID: ${serviceId}`);
    }

    const serviceArn = service.ServiceArn;
    if (!serviceArn) {
        throw new Error(`App Runner Client returned an empty ServiceArn for ${config.serviceName}`);
    } else {
        info(`Service ARN: ${serviceArn}`);
    }

    const serviceUrl = service.ServiceUrl;
    if (!serviceUrl) {
        throw new Error(`App Runner Client returned an empty ServiceUrl for ${config.serviceName}`);
    } else {
        info(`Service URL: ${serviceUrl}`);
    }

    return {
        ServiceId: serviceId,
        ServiceArn: serviceArn,
        ServiceUrl: serviceUrl,
    };
}

// Wait for the service to reach a stable state
export async function waitToStabilize(client: AppRunnerClient, serviceId: string, serviceArn: string, timeoutSeconds: number): Promise<void> {
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
