# Amazon "App Runner Service Deploy" action for GitHub Actions

Registers an AWS App Runner Service and deploys the application using the source code of a given GitHub repository. Supports both source code and Docker image based service.

## Table of Contents

<!-- toc -->

- [V2 changes](#v2-changes)
- [Usage](#usage)
  - [Code based service](#code-based-service)
  - [Image based service](#image-based-service)
- [Credentials and Region](#credentials-and-region)
- [Permissions](#permissions)
- [Troubleshooting](#troubleshooting)
- [License Summary](#license-summary)
- [Security Disclosures](#security-disclosures)

<!-- tocstop -->

## V2 Changes

This action's codebase has been refactored to support future growth as well as to simplify to processes of adding new capabilities.

Refer to the [Changelog](./CHANGELOG.md) for the change history.

## Usage

This github action supports two types of App Runner services: source code based and docker image based.

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.

### Code based service

Source code is application code that App Runner builds and deploys for you. You point App Runner to a source code repository and choose a suitable runtime. App Runner builds an image that's based on the base image of the runtime and your application code. It then starts a service that runs a container based on this image.

> Note: The list of supported runtime platforms is available [here](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/clients/client-apprunner/enums/runtime.html).

Here is the sample for deploying a NodeJS based service:

```yaml
name: Deploy to App Runner 
on:
  push:
    branches: [main] # Trigger workflow on git push to main branch
  workflow_dispatch: # Allow manual invocation of the workflow

jobs:  
  deploy:
    runs-on: ubuntu-latest
    # These permissions are needed to interact with GitHub's OIDC Token endpoint.
    permissions:
      id-token: write
      contents: read
    
    steps:            
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v1-node16
        with:
          # Use GitHub OIDC provider
          role-to-assume: ${{ secrets.AWS_ASSUME_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}
          
      - name: Deploy to App Runner
        id: deploy-apprunner
        uses: awslabs/amazon-app-runner-deploy@main
        env:
          SERVER_PORT: 80
          SECRET_ENV: secret_env
        with:
          service: app-runner-git-deploy-service
          source-connection-arn: ${{ secrets.AWS_CONNECTION_SOURCE_ARN }}
          repo: https://github.com/${{ github.repository }}
          branch: ${{ github.ref }}
          runtime: NODEJS_16
          build-command: npm install
          start-command: npm start
          port: 18000
          region: ${{ secrets.AWS_REGION }}
          cpu : 1
          memory : 2
          # Deprecated: wait-for-service-stability: true
          # The new way to control service stability timeout
          wait-for-service-stability-seconds: 600
          copy-env-vars: |
            SERVER_PORT
          copy-secret-env-vars: |
            SECRET_ENV
          instance-role-arn: ${{ secrets.INSTANCE_ROLE_ARN }}
          tags: >
            { "env": "test" }
      
      - name: App Runner URL
        run: echo "App runner URL ${{ steps.deploy-apprunner.outputs.service-url }}" 
```

**Note:**

- **AWS_CONNECTION_SOURCE_ARN** is the ARN of the source code connector in AWS App Runner, for more details refer to this [documentation](https://docs.aws.amazon.com/apprunner/latest/dg/manage-connections.html)

### Image based service

Here, a source image (*that could be a public or private container image stored in an image repository*) can get used by App Runner to get the service running on a container. No build stage is necessary. Rather, you provide a ready-to-deploy image.

Here is the sample for deploying a App Runner service based on docker image:

```yaml
name: Deploy to App Runner
on:
  push:
    branches: [main] # Trigger workflow on git push to main branch
  workflow_dispatch: # Allow manual invocation of the workflow

jobs:  
  deploy:
    runs-on: ubuntu-latest
    # These permissions are needed to interact with GitHub's OIDC Token endpoint.
    permissions:
      id-token: write
      contents: read
    
    steps:      
      - name: Checkout
        uses: actions/checkout@v2
        with:
          persist-credentials: false
          
      - name: Configure AWS credentials
        id: aws-credentials
        uses: aws-actions/configure-aws-credentials@v1-node16
        with:
          # Use GitHub OIDC provider
          role-to-assume: ${{ secrets.AWS_ASSUME_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1        

      - name: Build, tag, and push image to Amazon ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: nodejs
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          echo "::set-output name=image::$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG"  
          
      - name: Deploy to App Runner Image
        id: deploy-apprunner
        uses: awslabs/amazon-app-runner-deploy@main
        with:
          service: app-runner-git-deploy-service
          image: ${{ steps.build-image.outputs.image }}
          access-role-arn: ${{ secrets.ROLE_ARN }}
          region: ${{ secrets.AWS_REGION }}
          cpu : 1
          memory : 2
          # Deprecated: wait-for-service-stability: true
          # The new way to control service stability timeout
          wait-for-service-stability-seconds: 1200
      
      - name: App Runner URL
        run: echo "App runner URL ${{ steps.deploy-apprunner.outputs.service-url }}" 
```

**Note:**

- The above example uses github action, to build the docker image, push it to AWS ECR and use the same for App Runner deployment
- **ROLE_ARN** is the Amazon Resource Name (ARN) of the IAM role that grants the App Runner service access to a source repository. It's required for ECR image repositories (but not for ECR Public repositories)

## Credentials and Region

This action relies on the [default behavior of the AWS SDK for Javascript](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) to determine AWS credentials and region.
Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region.

We recommend using [GitHub's OIDC provider](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) to get short-lived credentials needed for your actions. 

It is recommended to follow [Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) for the AWS credentials used in GitHub Actions workflows, including:

- Do not store credentials in your repository's code.  You may use [GitHub Actions secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets) to store credentials and redact credentials from GitHub Actions workflow logs.
- [Create an individual IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#create-iam-users) with an access key for use in GitHub Actions workflows, preferably one per repository. Do not use the AWS account root user access key.
- [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions workflows.  Grant only the permissions required to perform the actions in your GitHub Actions workflows.  See the Permissions section below for the permissions required by this action.
- [Rotate the credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#rotate-credentials) used in GitHub Actions workflows regularly.
- [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Permissions

Generally this action requires the following minimum set of permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "apprunner:ListServices",
                "apprunner:CreateService",
                "apprunner:UpdateService",
                "apprunner:DescribeService",
                "apprunner:TagResource",
                "iam:PassRole"
            ],
            "Resource": "*"
        }
    ]
}
```

For **Image based service** this action requires additionally the following minimum set of permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:DescribeImages",
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability"
            ],
            "Resource": "*"
        }
    ]
}
```

## Troubleshooting

This action emits debug logs to help troubleshoot deployment failures.  To see the debug logs, create a secret named `ACTIONS_STEP_DEBUG` with value `true` in your repository.

## License Summary

This code is made available under the MIT-0 license, for details refer to [LICENSE](LICENSE) file.

## Security Disclosures

If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions [here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS security directly](mailto:aws-security@amazon.com).
