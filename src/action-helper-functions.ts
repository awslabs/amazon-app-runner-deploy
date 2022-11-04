import { info } from "@actions/core";
import { AppRunnerClient, DescribeServiceCommand, ListServicesCommand, ListServicesCommandOutput, Service, ServiceStatus } from "@aws-sdk/client-apprunner";
import { IActionParams } from "./action-configuration";
import { getCreateCommand, getDeleteCommand, getUpdateCommand } from "./client-apprunner-commands";

// Core service attributes to be returned to the calling GitHub action handler code
export interface IServiceInfo {
    ServiceId: string;
    ServiceArn: string;
    ServiceUrl: string;
}

export interface IExistingService {
    ServiceArn: string;
    Status: ServiceStatus;
}

// Wait in milliseconds (helps to implement exponential retries)
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Get the existing service ARN or undefined, if there is no existing service
export async function findExistingService(client: AppRunnerClient, serviceName: string): Promise<IExistingService | undefined> {

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
                if (service.ServiceName === serviceName && service.ServiceArn) {
                    info(`${service.ServiceArn} status: ${service.Status}`);
                    info(`Typed status: ${service.Status as ServiceStatus}`);
                    return {
                        ServiceArn: service.ServiceArn,
                        Status: service.Status as ServiceStatus,
                    };
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
    info(`Updating existing service ${config.serviceName} (${serviceArn})`);
    const command = getUpdateCommand(serviceArn, config);
    const updateServiceResponse = await client.send(command);
    return updateServiceResponse.Service;
}

async function deleteService(client: AppRunnerClient, config: IActionParams, serviceArn: string): Promise<void> {
    info(`Deleting existing service ${config.serviceName} (${serviceArn})`);
    const command = getDeleteCommand(serviceArn);
    const deleteServiceResponse = await client.send(command);
    info(`Delete service response: ${JSON.stringify(deleteServiceResponse.Service)}`);
}

export async function validateAndExtractServiceInfo(config: IActionParams, service?: Service) {
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

// Create or update an existing service, depending on whether it already exists
export async function createOrUpdateService(client: AppRunnerClient, config: IActionParams, existingService?: IExistingService): Promise<IServiceInfo> {
    let service: Service | undefined = undefined;
    if (existingService) {
        info(`Existing service info: ${JSON.stringify(existingService)}`);
        if (existingService.Status === ServiceStatus.CREATE_FAILED) {
            await deleteService(client, config, existingService.ServiceArn);
            service = await createService(client, config);
        } else {
            service = await updateService(client, config, existingService.ServiceArn);
        }
    } else {
        service = await createService(client, config);
    }

    return validateAndExtractServiceInfo(config, service);
}

async function describeService(client: AppRunnerClient, serviceArn: string): Promise<IExistingService | undefined> {
    const describeServiceResponse = await client.send(new DescribeServiceCommand({
        ServiceArn: serviceArn
    }));

    const service = describeServiceResponse.Service;
    if(!service) {
        return undefined;
    }

    return {
        ServiceArn: serviceArn,
        Status: service.Status as ServiceStatus,
    };
}

// export async function waitToBeDeleted(client: AppRunnerClient, serviceId: string, serviceArn: string, timeoutSeconds: number): Promise<void> {
//     const interval = setInterval(() => {
//     }, 1000);
// }

// async function waitForServiceStatus(client: AppRunnerClient, serviceId: string, serviceArn: string, condition: (serviceStatus?: ServiceStatus)=>boolean, timeoutSeconds: number) {
//     const stopTime = new Date(new Date().getTime() + timeoutSeconds * 1000).getTime();

//     let status: ServiceStatus = ServiceStatus.OPERATION_IN_PROGRESS;
//     info(`Waiting for the service ${serviceId} to reach stable state`);
//     while (status === ServiceStatus.OPERATION_IN_PROGRESS && stopTime >= new Date().getTime()) {
//         const startTime = new Date().getTime();
//         const describeServiceResponse = await client.send(new DescribeServiceCommand({
//             ServiceArn: serviceArn
//         }));

//         status = (describeServiceResponse.Service?.Status as ServiceStatus | undefined) ?? ServiceStatus.OPERATION_IN_PROGRESS;
//         if (status !== ServiceStatus.OPERATION_IN_PROGRESS) {
//             info(`Service ${serviceId} has reached the stable state ${status}`);
//             return;
//         }

//         const duration = new Date().getTime() - startTime;

//         const idleTime = 5000 - duration;
//         if (idleTime > 0) {
//             // Wait for the rest of 5 second before the retry
//             await sleep(idleTime);
//         }
//     }

//     throw new Error(`Service did not reach stable state within ${timeoutSeconds} seconds`);
// }

// Wait for the service to reach a stable state
export async function waitToStabilize(client: AppRunnerClient, serviceId: string, serviceArn: string, timeoutSeconds: number): Promise<void> {
    const stopTime = new Date(new Date().getTime() + timeoutSeconds * 1000).getTime();

    let status: ServiceStatus = ServiceStatus.OPERATION_IN_PROGRESS;
    info(`Waiting for the service ${serviceId} to reach stable state`);
    while (status === ServiceStatus.OPERATION_IN_PROGRESS && stopTime >= new Date().getTime()) {
        const startTime = new Date().getTime();
        const describeServiceResponse = await client.send(new DescribeServiceCommand({
            ServiceArn: serviceArn
        }));

        status = (describeServiceResponse.Service?.Status as ServiceStatus | undefined) ?? ServiceStatus.OPERATION_IN_PROGRESS;
        if (status !== ServiceStatus.OPERATION_IN_PROGRESS) {
            info(`Service ${serviceId} has reached the stable state ${status}`);
            return;
        }

        const duration = new Date().getTime() - startTime;

        const idleTime = 5000 - duration;
        if (idleTime > 0) {
            // Wait for the rest of 5 second before the retry
            await sleep(idleTime);
        }
    }

    throw new Error(`Service did not reach stable state within ${timeoutSeconds} seconds`);
}
