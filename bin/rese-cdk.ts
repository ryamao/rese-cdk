#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import * as path from "path";
import { UsCertificateStack } from "../lib/us-certificate-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { BackendStack } from "../lib/backend-stack";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const app = new cdk.App();

const usStack = new UsCertificateStack(app, "UsStack", {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: "us-east-1",
  },
  crossRegionReferences: true,
});

new FrontendStack(app, "FrontendStack", {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: "ap-northeast-1",
  },
  crossRegionReferences: true,
  hostedZone: usStack.hostedZone,
  certificate: usStack.certificate,
});

new BackendStack(app, "BackendStack", {
  env: {
    account: process.env.AWS_ACCOUNT_ID,
    region: "ap-northeast-1",
  },
});
