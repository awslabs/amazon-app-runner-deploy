
import { getInput, info, setFailed, setOutput } from "@actions/core";
import { AppRunnerClient, CreateServiceCommand, ListServicesCommand, ListServicesCommandOutput, UpdateServiceCommand, DescribeServiceCommand, ImageRepositoryType, Service } from "@aws-sdk/client-apprunner";
import { debug } from '@actions/core';

//https://docs.aws.amazon.com/apprunner/latest/api/API_CodeConfigurationValues.html
const supportedRuntime = ['NODEJS_12', 'PYTHON_3', 'NODEJS_14', 'CORRETTO_8', 'CORRETTO_11'];

const OPERATION_IN_PROGRESS = "OPERATION_IN_PROGRESS";
const MAX_ATTEMPTS = 120;

// Wait in milliseconds (helps to implement exponential retries)
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Determine ECR image repository type
function getImageType(imageUri: string) {
    return imageUri.startsWith("public.ecr") ? ImageRepositoryType.ECR_PUBLIC : ImageRepositoryType.ECR
}

function getInputInt(name: string, defaultValue: number): number {
    const val = getInput(name, { required: false });
    if (!val) {
        return defaultValue;
    }

    const result = Number.parseInt(val);

    return isNaN(result) ? defaultValue : result;
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
    const serviceName = getInput('service', { required: true });
    const sourceConnectionArn = getInput('source-connection-arn', { required: false });
    const accessRoleArn = getInput('access-role-arn', { required: false });
    const repoUrl = getInput('repo', { required: false });
    const imageUri = getInput('image', { required: false });
    const runtime = getInput('runtime', { required: false });
    const buildCommand = getInput('build-command', { required: false });
    const startCommand = getInput('start-command', { required: false });
    const port = getInputInt('port', 80);
    const waitForService = getInput('wait-for-service-stability', { required: false }) || "false";

    try {
        // Check for service type
        const isImageBased = !!imageUri;

        // Validations - AppRunner Service name
        if (!serviceName)
            throw new Error('AppRunner service name cannot be empty');

        // Image URI required if the service is docker registry based
        if (isImageBased && repoUrl)
            throw new Error('Either docker image registry or code repository expected, not both');

        // Mandatory check for source code based AppRunner
        if (!isImageBased) {
            if (!sourceConnectionArn || !repoUrl || !runtime
                || !buildCommand
                || !startCommand)
                throw new Error('Connection ARN, Repository URL, Runtime, build and start command are expected');


            // Runtime enum check
            if (!supportedRuntime.includes(runtime))
                throw new Error(`Unexpected value passed in runtime ${runtime} only supported values are: ${JSON.stringify(supportedRuntime)}`);
        } else {            
            // IAM Role check for ECR based AppRunner
            if (!accessRoleArn)
                throw new Error(`Access role ARN is required for ECR based AppRunner`);
        }

        // Defaults
        // Region - us-east-1
        const region = getInput('region', { required: false }) || 'us-east-1';

        // Branch - master
        let branch = getInput('branch', { required: false }) || 'master';

        // Get branch details from refs
        if (branch.startsWith("refs/")) {
            branch = branch.split("/")[2];
        }

        // CPU - 1
        const cpu = getInputInt('cpu', 1);

        // Memory - 2
        const memory = getInputInt('memory', 2);

        // AppRunner client
        const client = new AppRunnerClient({ region: region });

        // Check whether service exists and get ServiceArn
        let serviceArn = await getServiceArn(client, serviceName);

        // New service or update to existing service
        let service: Service | undefined = undefined;
        if (!serviceArn) {
            info(`Creating service ${serviceName}`);
            const command = new CreateServiceCommand({
                ServiceName: serviceName,
                InstanceConfiguration: {
                    Cpu: `${cpu} vCPU`,
                    Memory: `${memory} GB`,
                },
                SourceConfiguration: {}
            });
            if (isImageBased) {
                // Image based set docker registry details
                command.input.SourceConfiguration = {
                    AuthenticationConfiguration: {
                        AccessRoleArn: accessRoleArn
                    },
                    ImageRepository: {
                        ImageIdentifier: imageUri,
                        ImageRepositoryType: getImageType(imageUri),
                        ImageConfiguration: {
                            Port: `${port}`
                        }
                    }
                };
            } else {
                // Source code based set source code details
                command.input.SourceConfiguration = {
                    AuthenticationConfiguration: {
                        ConnectionArn: sourceConnectionArn
                    },
                    AutoDeploymentsEnabled: true,
                    CodeRepository: {
                        RepositoryUrl: repoUrl,
                        SourceCodeVersion: {
                            Type: "BRANCH",
                            Value: branch
                        },
                        CodeConfiguration: {
                            ConfigurationSource: "API",
                            CodeConfigurationValues: {
                                Runtime: runtime,
                                BuildCommand: buildCommand,
                                StartCommand: startCommand,
                                Port: `${port}`
                            }
                        }
                    }
                };
            }
            const createServiceResponse = await client.send(command);
            service = createServiceResponse.Service;
            info(`Service creation initiated with service ID - ${service?.ServiceId}`)
            serviceArn = createServiceResponse.Service?.ServiceArn;
        } else {
            info(`Updating existing service ${serviceName}`);
            const command = new UpdateServiceCommand({
                ServiceArn: serviceArn,
                SourceConfiguration: {}
            });
            if (isImageBased) {
                // Update only in case of docker registry based service
                command.input.SourceConfiguration = {
                    AuthenticationConfiguration: {
                        AccessRoleArn: accessRoleArn
                    },
                    ImageRepository: {
                        ImageIdentifier: imageUri,
                        ImageRepositoryType: getImageType(imageUri),
                        ImageConfiguration: {
                            Port: `${port}`
                        }
                    }
                }
            } else {
                // Source code based set source code details
                command.input.SourceConfiguration = {
                    AuthenticationConfiguration: {
                        ConnectionArn: sourceConnectionArn
                    },
                    CodeRepository: {
                        RepositoryUrl: repoUrl,
                        SourceCodeVersion: {
                            Type: "BRANCH",
                            Value: branch
                        },
                        CodeConfiguration: {
                            ConfigurationSource: "API",
                            CodeConfigurationValues: {
                                Runtime: runtime,
                                BuildCommand: buildCommand,
                                StartCommand: startCommand,
                                Port: `${port}`
                            }
                        }
                    }
                };
            }
            const updateServiceResponse = await client.send(command);
            service = updateServiceResponse.Service;
            info(`Service update initiated with operation ID - ${service?.ServiceId}`)
            serviceArn = updateServiceResponse.Service?.ServiceArn;
        }

        // Set output
        const serviceId = service?.ServiceId;
        setOutput('service-id', serviceId);
        setOutput('service-url', service?.ServiceUrl);

        // Wait for service to be stable (if required)
        if (waitForService === "true") {
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
