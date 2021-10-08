import { CreateServiceCommandInput, CreateServiceCommandOutput, DescribeServiceCommandInput, DescribeServiceCommandOutput, ListServicesCommandInput, ListServicesCommandOutput, UpdateServiceCommandInput, UpdateServiceCommandOutput } from "@aws-sdk/client-apprunner";
import { PartialDeep } from "type-fest";

type ExpectedCommandInputs = CreateServiceCommandInput | UpdateServiceCommandInput | DescribeServiceCommandInput | ListServicesCommandInput;

class AppRunnerClientCommands {
    static isCreateServiceCommand(input: ExpectedCommandInputs): input is CreateServiceCommandInput {
        return (input as CreateServiceCommandInput).ServiceName !== undefined;
    }

    static isUpdateServiceCommand(input: ExpectedCommandInputs): input is UpdateServiceCommandInput {
        const typedInput = input as UpdateServiceCommandInput;
        return typedInput.ServiceArn !== undefined && typedInput.SourceConfiguration !== undefined;
    }

    static isDescribeServiceCommand(input: ExpectedCommandInputs): input is DescribeServiceCommandInput {
        return Object.keys(input).length === 1 && (input as DescribeServiceCommandInput).ServiceArn !== undefined;
    }

    static isListServicesCommand(input: ExpectedCommandInputs): input is ListServicesCommandInput {
        const keys = Object.keys(input);
        return !keys.length || keys.includes('NextToken');
    }
}

export interface ICommandLog {
    create: CreateServiceCommandInput[],
    update: UpdateServiceCommandInput[],
    describe: DescribeServiceCommandInput[],
    list: ListServicesCommandInput[],
}

export class CommandLog implements ICommandLog {
    create: CreateServiceCommandInput[] = [];
    update: UpdateServiceCommandInput[] = [];
    describe: DescribeServiceCommandInput[] = [];
    list: ListServicesCommandInput[] = [];

    reset(): void {
        this.create = [];
        this.update = [];
        this.describe = [];
        this.list = [];
    }
}

export interface ICommandConfig {
    createServiceCommand?: PartialDeep<CreateServiceCommandOutput>[],
    updateServiceCommand?: PartialDeep<UpdateServiceCommandOutput>[],
    describeServiceCommand?: PartialDeep<DescribeServiceCommandOutput>[],
    listServicesCommand?: PartialDeep<ListServicesCommandOutput>[],
}

export type SupportedCommandOutput = PartialDeep<CreateServiceCommandOutput> | PartialDeep<UpdateServiceCommandOutput> | PartialDeep<DescribeServiceCommandOutput> | PartialDeep<ListServicesCommandOutput>;

export function getFakeCommandOutput(config: ICommandConfig, input: ExpectedCommandInputs, logInstance: ICommandLog): SupportedCommandOutput {
    if (AppRunnerClientCommands.isCreateServiceCommand(input)) {
        const iteration = logInstance.create.length;
        logInstance.create.push(input);
        if (!config.createServiceCommand || config.createServiceCommand.length <= iteration) {
            throw new Error(`Unexpected CreateServiceCommand call #${iteration}: ${JSON.stringify(input, undefined, 2)}`);
        }
        return config.createServiceCommand[iteration];
    } else if (AppRunnerClientCommands.isUpdateServiceCommand(input)) {
        const iteration = logInstance.update.length;
        logInstance.update.push(input);
        if (!config.updateServiceCommand || config.updateServiceCommand.length <= iteration) {
            throw new Error(`Unexpected UpdateServiceCommand call #${iteration}: ${JSON.stringify(input, undefined, 2)}`);
        }
        return config.updateServiceCommand[iteration];
    } else if (AppRunnerClientCommands.isDescribeServiceCommand(input)) {
        const iteration = logInstance.describe.length;
        logInstance.describe.push(input);
        if (!config.describeServiceCommand || config.describeServiceCommand.length <= iteration) {
            throw new Error(`Unexpected DescribeServiceCommand call #${iteration}: ${JSON.stringify(input, undefined, 2)}`);
        }
        return config.describeServiceCommand[iteration];
    } else if (AppRunnerClientCommands.isListServicesCommand(input)) {
        const iteration = logInstance.list.length;
        logInstance.list.push(input);
        if (!config.listServicesCommand || config.listServicesCommand.length <= iteration) {
            throw new Error(`Unexpected ListServicesCommand call #${iteration}: ${JSON.stringify(input, undefined, 2)}`);
        }
        return config.listServicesCommand[iteration];
    } else {
        throw new Error(`Unexpected input shape: ${JSON.stringify(input, undefined, 2)}`);
    }
}