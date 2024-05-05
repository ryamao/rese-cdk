import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3_deployment from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53_t from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as dotenv from "dotenv";
import * as path from "path";
import { Construct } from "constructs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

export interface FrontendStackProps extends cdk.StackProps {
  readonly hostedZone: route53.IHostedZone;
  readonly certificate: acm.ICertificate;
}

export class FrontendStack extends cdk.Stack {
  readonly FRONTEND_DIST_PATH = "rese-frontend/dist";

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html",
    });

    const frontendIdentify = new cloudfront.OriginAccessIdentity(
      this,
      "FrontendIdentity"
    );

    frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        effect: iam.Effect.ALLOW,
        principals: [frontendIdentify.grantPrincipal],
        resources: [`${frontendBucket.bucketArn}/*`],
      })
    );

    const frontendDistribution = new cloudfront.CloudFrontWebDistribution(
      this,
      "FrontendDistribution",
      {
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: frontendBucket,
              originAccessIdentity: frontendIdentify,
            },
            behaviors: [{ isDefaultBehavior: true }],
          },
        ],
        errorConfigurations: [
          {
            errorCode: 403,
            responseCode: 200,
            responsePagePath: "/index.html",
          },
          {
            errorCode: 404,
            responseCode: 200,
            responsePagePath: "/index.html",
          },
        ],
        viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(
          props.certificate,
          {
            aliases: [process.env.FRONTEND_FQDN!],
          }
        ),
      }
    );

    new s3_deployment.BucketDeployment(this, "DeployWebsite", {
      sources: [s3_deployment.Source.asset(this.FRONTEND_DIST_PATH)],
      destinationBucket: frontendBucket,
      distribution: frontendDistribution,
      distributionPaths: ["/*"],
    });

    new route53.ARecord(this, "ARecord", {
      zone: props.hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53_t.CloudFrontTarget(frontendDistribution)
      ),
      recordName: process.env.FRONTEND_FQDN!,
    });
  }
}
