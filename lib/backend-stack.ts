import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3_assets from "aws-cdk-lib/aws-s3-assets";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as elbv2_t from "aws-cdk-lib/aws-elasticloadbalancingv2-targets";
import * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53_t from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as dotenv from "dotenv";
import * as path from "path";
import { Construct } from "constructs";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = this.createVpc();
    const database = this.createDatabase({ vpc });
    const storageBucket = this.createStorageBucket();
    const instance = this.createBackendServer({ vpc });
    const loadBalancer = this.createLoadBalancer({
      vpc,
      targets: [new elbv2_t.InstanceTarget(instance)],
    });

    database.grantConnect(instance);
    database.secret?.grantRead(instance);
    database.connections.allowFrom(instance, ec2.Port.tcp(3306));
    instance.connections.allowFrom(loadBalancer, ec2.Port.tcp(80));
    storageBucket.grantReadWrite(instance);
    storageBucket.grantPut(instance);

    this.addBootstrapScript({
      instance,
      dbHost: database.dbInstanceEndpointAddress,
      dbSecretId: database.secret?.secretArn!,
      storageBucketName: storageBucket.bucketName,
    });
  }

  private createVpc() {
    return new ec2.Vpc(this, "Vpc", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/16"),
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });
  }

  private createDatabase({ vpc }: { vpc: ec2.Vpc }) {
    const credentials = rds.Credentials.fromGeneratedSecret("admin");

    const database = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      credentials,
      databaseName: "rese_db",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    return database;
  }

  private createStorageBucket() {
    const storageBucket = new s3.Bucket(this, "StorageBucket", {
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    
    storageBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        resources: [storageBucket.arnForObjects("*")],
      })
    );
    
    return storageBucket;
  }

  private createBackendServer({ vpc }: { vpc: ec2.Vpc }) {
    const securityGroup = new ec2.SecurityGroup(this, "ServerSecurityGroup", {
      vpc,
      description: "Allow HTTP/HTTPS traffic",
      allowAllOutbound: true,
    });
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH traffic"
    );

    const keyPair = new ec2.KeyPair(this, "KeyPair", {
      type: ec2.KeyPairType.ED25519,
      format: ec2.KeyPairFormat.PEM,
    });

    const backendServer = new ec2.Instance(this, "BackendServer", {
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T2,
        ec2.InstanceSize.MICRO
      ),
      machineImage: new ec2.AmazonLinuxImage({
        generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2023,
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      role: new iam.Role(this, "BackendServerRole", {
        assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup,
      keyPair,
      associatePublicIpAddress: true,
    });

    return backendServer;
  }

  private createLoadBalancer({
    vpc,
    targets,
  }: {
    vpc: ec2.Vpc;
    targets: elbv2.IApplicationLoadBalancerTarget[];
  }) {
    const securityGroup = new ec2.SecurityGroup(
      this,
      "LoadBalancerSecurityGroup",
      {
        vpc,
        description: "Allow HTTP/HTTPS traffic",
        allowAllOutbound: true,
      }
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic"
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );
    securityGroup.addIngressRule(
      ec2.Peer.anyIpv6(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic"
    );

    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      "ApplicationLoadBalancer",
      {
        vpc,
        internetFacing: true,
        securityGroup,
      }
    );

    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: process.env.DOMAIN_NAME!,
    });

    new route53.ARecord(this, "AliasRecord", {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53_t.LoadBalancerTarget(loadBalancer)
      ),
      recordName: process.env.BACKEND_FQDN,
    });

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: process.env.BACKEND_FQDN!,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    loadBalancer
      .addListener("Listener", {
        port: 443,
        certificates: [certificate],
      })
      .addTargets("TargetGroup", {
        port: 80,
        targets,
      });

    loadBalancer.addRedirect({
      sourcePort: 80,
      sourceProtocol: elbv2.ApplicationProtocol.HTTP,
      targetPort: 443,
      targetProtocol: elbv2.ApplicationProtocol.HTTPS,
    });

    return loadBalancer;
  }

  private addBootstrapScript({
    instance,
    dbHost,
    dbSecretId,
    storageBucketName,
  }: {
    instance: ec2.Instance;
    dbHost: string;
    dbSecretId: string;
    storageBucketName: string;
  }) {
    const nginxConfigAsset = new s3_assets.Asset(this, "NginxConfigAsset", {
      path: path.join(__dirname, "../assets/nginx.conf"),
    });
    nginxConfigAsset.grantRead(instance);
    const nginxConfigPath = instance.userData.addS3DownloadCommand({
      bucket: nginxConfigAsset.bucket,
      bucketKey: nginxConfigAsset.s3ObjectKey,
    });

    const envConfigAsset = new s3_assets.Asset(this, "EnvConfigAsset", {
      path: path.join(__dirname, "../assets/.env"),
    });
    envConfigAsset.grantRead(instance);
    const envConfigPath = instance.userData.addS3DownloadCommand({
      bucket: envConfigAsset.bucket,
      bucketKey: envConfigAsset.s3ObjectKey,
    });

    instance.userData.addCommands(
      "dnf update -y",
      "dnf install -y nginx",
      `cp ${nginxConfigPath} /etc/nginx/nginx.conf`,
      "systemctl enable nginx",
      "systemctl start nginx",

      "dnf update -y",
      "dnf install -y php8.2 php8.2-fpm php8.2-zip php8.2-mysqlnd",
      'sed -i "s/^user = apache/user = nginx/" /etc/php-fpm.d/www.conf',
      'sed -i "s/^group = apache/group = nginx/" /etc/php-fpm.d/www.conf',
      "export HOME=/root",
      "cd /tmp",
      "php -r \"copy('https://getcomposer.org/installer', 'composer-setup.php');\"",
      "php composer-setup.php --install-dir=/usr/local/bin --filename=composer",
      "systemctl enable php-fpm",
      "systemctl start php-fpm",

      "dnf update -y",
      "dnf install -y git",
      "mkdir -p /var/www",
      "cd /var/www",
      "git clone https://github.com/ryamao/rese-backend.git rese",
      "cd rese",

      `cp ${envConfigPath} .env`,
      `echo APP_URL=https://${process.env.BACKEND_FQDN} >> .env`,
      `echo SPA_URL=https://${process.env.FRONTEND_FQDN} >> .env`,
      `echo SANCTUM_STATEFUL_DOMAINS=${process.env.FRONTEND_FQDN} >> .env`,
      `echo SESSION_DOMAIN=.${process.env.DOMAIN_NAME} >> .env`,
      `echo DB_HOST=${dbHost} >> .env`,
      `echo DB_USERNAME=$(aws secretsmanager get-secret-value --secret-id ${dbSecretId} --query SecretString | jq -r . | jq -r .username) >> .env`,
      `echo DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id ${dbSecretId} --query SecretString | jq -r . | jq -r .password) >> .env`,
      `echo AWS_ACCESS_KEY_ID=${process.env.AWS_ACCESS_KEY_ID} >> .env`,
      `echo AWS_SECRET_ACCESS_KEY=${process.env.AWS_SECRET_ACCESS_KEY} >> .env`,
      `echo AWS_BUCKET=${storageBucketName} >> .env`,
      `echo ADMIN_EMAIL=${process.env.ADMIN_EMAIL} >> .env`,
      `echo ADMIN_PASSWORD=${process.env.ADMIN_PASSWORD} >> .env`,
      `echo STRIPE_KEY=${process.env.STRIPE_KEY} >> .env`,
      `echo STRIPE_SECRET=${process.env.STRIPE_SECRET} >> .env`,
      `echo STRIPE_WEBHOOK_SECRET=${process.env.STRIPE_WEBHOOK_SECRET} >> .env`,

      "composer install --prefer-dist --no-progress --no-interaction",
      "php artisan key:generate",
      "php artisan migrate --seed --force",

      "chown -R nginx:nginx /var/www/rese"
    );
  }
}
