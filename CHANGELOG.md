# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.4.0] - 2023-04-27

### Added

- Support RuntimeEnvironmentSecrets ([#29](https://github.com/awslabs/amazon-app-runner-deploy/issues/29))
- Support InstanceRoleArn ([#40](https://github.com/awslabs/amazon-app-runner-deploy/issues/40))

### Changed

- NPM dependency updates

## [2.3.0] - 2023-04-19

### Added

- Action will fail if the deployment was rolled back due to an error ([#11](https://github.com/awslabs/amazon-app-runner-deploy/issues/11), [#32](https://github.com/awslabs/amazon-app-runner-deploy/issues/32))

## [2.2.2] - 2023-03-30

### Added

- Action version logging

### Changed

- Update all external NPM dependencies

## [2.2.1] - 2023-03-29

### Fixed

- Error: The auto scaling configuration ARN you specified isn't valid. ARN: '' ([#36](https://github.com/awslabs/amazon-app-runner-deploy/issues/36))

## [2.2.0] - 2023-03-28

### Added

- Optional `auto-scaling-config-arn` input. When specified this will be applied to new and existing services.

## [2.1.0] - 2023-02-08

### Added

- Tagging support ([#21](https://github.com/awslabs/amazon-app-runner-deploy/issues/21))

## [2.0.1] - 2023-01-10

- Dependency updates

## [2.0.0] - 2022-10-02

### Added

- Action outputs: `service-arn` and `service-url`.
- Optional `wait-for-service-stability-seconds` configuration parameter. Valid range is between 10 and 3600 seconds. The default is 600 seconds if `wait-for-service-stability` flag is set to true. This is a replacement for the existing `wait-for-service-stability` boolean flag, which will be deprecated in a future release.
- Optional `action` parameter. The only valid value is `create_or_update` (case insensitive) and the parameter is optional. It is introduced for adding more sub-actions in a future release.
- Support for additional `runtime` parameter values: `DOTNET_6`, `GO_1`, `NODEJS_16`, `PHP_81`, `RUBY_31`.
- If there is an existing service with CREATE_FAILED status, it will be deleted first, before the new service creation is attempted.
- [Add support for environment variables](https://github.com/awslabs/amazon-app-runner-deploy/issues/4).

### Changed

- **BREAKING CHANGE**: The default branch name is now `main`.
- **BREAKING CHANGE**: Action migrated to run on Node16.
- **BREAKING CHANGE**: Update all NPM module references, including major version upgrades.
- **BREAKING CHANGE**: Refactor code to be compatible with future enhancements and updates.
- **BREAKING CHANGE**: Log messages changed to match the new refactored code structure.
- Supported runtime list is no longer hardcoded, but automatically synchronized with the one, defined by [AppRunner Client SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-apprunner/enums/runtime.html), so that new runtime identifier will become available with AWS SDK NPM module updates.
- Mark `wait-for-service-stability` as obsolete.

### Fixed

- [Image is ignored for existing App Runner Service](https://github.com/awslabs/amazon-app-runner-deploy/issues/13)
- [Runtime Support for Node.js 16](https://github.com/awslabs/amazon-app-runner-deploy/issues/10)

## [1.x]

The initial family of releases with core functionality.
