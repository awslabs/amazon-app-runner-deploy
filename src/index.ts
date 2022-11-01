import { info, setFailed, setOutput } from "@actions/core";
import { AppRunnerClient } from "@aws-sdk/client-apprunner";
import { debug } from '@actions/core';
import { getConfig } from "./action-configuration";
import { createOrUpdateService, getServiceArn, waitToStabilize } from "./action-helper-functions";

// GitHub action handler function
export async function run(): Promise<void> {

    try {
        // Parse action configuration information into a strongly typed object
        const config = getConfig();

        // AppRunner client
        const client = new AppRunnerClient({ region: config.region });

        // Check whether service exists and get ServiceArn
        const existingServiceArn = await getServiceArn(client, config.serviceName);

        // Create or update service, depending on whether it already exists
        const serviceInfo = await createOrUpdateService(client, config, existingServiceArn);

        // Set outputs
        setOutput('service-id', serviceInfo.ServiceId);
        setOutput('service-arn', serviceInfo.ServiceArn);
        setOutput('service-url', serviceInfo.ServiceUrl);

        // Wait for service to be stable (if required)
        if (config.waitForService) {
            await waitToStabilize(client, serviceInfo.ServiceId, serviceInfo.ServiceArn, config.waitTimeout);
        } else {
            info(
                `Service ${serviceInfo.ServiceId} has started an update. Watch for its progress in the AppRunner console`
            );
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
