
import { info, setFailed, setOutput } from "@actions/core";
import { AppRunnerClient, ListServicesCommand, ListServicesCommandOutput, DescribeServiceCommand } from "@aws-sdk/client-apprunner";
import { debug } from '@actions/core';
import { getConfig } from "./configuration";
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

export async function run(): Promise<void> {

    try {

        const config = getConfig();

        // AppRunner client
        const client = new AppRunnerClient({ region: config.region });

        // Check whether service exists and get ServiceArn
        let serviceArn = await getServiceArn(client, config.serviceName);

        // New service or update to existing service
        let serviceId: string | undefined = undefined;
        if (!serviceArn) {
            info(`Creating service ${config.serviceName}`);
            const command = getCreateCommand(config);
            const createServiceResponse = await client.send(command);
            serviceId = createServiceResponse.Service?.ServiceId;
            info(`Service creation initiated with service ID - ${serviceId}`)
            serviceArn = createServiceResponse.Service?.ServiceArn;
        } else {
            info(`Updating existing service ${config.serviceName}`);
            const command = getUpdateCommand(serviceArn, config);
            const updateServiceResponse = await client.send(command);
            serviceId = updateServiceResponse.Service?.ServiceId;
            info(`Service update initiated with operation ID - ${serviceId}`)
            serviceArn = updateServiceResponse.Service?.ServiceArn;
        }

        // Set output
        setOutput('service-id', serviceId);

        // Wait for service to be stable (if required)
        if (config.waitForService) {
            let attempts = 0;
            let status = OPERATION_IN_PROGRESS;
            info(`Waiting for the service ${serviceId} to reach stable state`);
            while (status === OPERATION_IN_PROGRESS && attempts < MAX_ATTEMPTS) {
                const describeServiceResponse = await client.send(new DescribeServiceCommand({
                    ServiceArn: serviceArn
                }));

                status = describeServiceResponse.Service?.Status ?? OPERATION_IN_PROGRESS;
                if (status !== OPERATION_IN_PROGRESS)
                    break;

                // Wait for 5 seconds and re-try
                await sleep(5000);
                attempts++;
            }

            // Throw error if service has not reached an end state
            if (attempts >= MAX_ATTEMPTS)
                throw new Error(`Service did not reach stable state after ${attempts} attempts`);
            else
                info(`Service ${serviceId} has reached the stable state ${status}`);
        } else {
            info(`Service ${serviceId} has started creation. Watch for creation progress in AppRunner console`);
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
