import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as dotenv from "dotenv";
import * as path from "path";
import { Construct } from "constructs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

export class UsCertificateStack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;
  public readonly certificate: acm.Certificate;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: process.env.DOMAIN_NAME!,
    });

    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: process.env.DOMAIN_NAME!,
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });
  }
}
