import { CfnOutput, Duration, Fn, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export interface MesaSolicitudesStackProps extends StackProps {
  readonly stage: string;
}

const SUMMARY_ATTRIBUTES = ['number', 'title', 'category', 'status', 'createdAt', 'updatedAt'];

/**
 * Despliegue serverless: CloudFront sirve el frontend (S3) y enruta /api/* a
 * API Gateway HTTP -> Lambda (la misma app Fastify de local) -> DynamoDB.
 * Cognito reemplaza la identidad simulada: tenantId es un atributo inmutable del usuario.
 */
export class MesaSolicitudesStack extends Stack {
  constructor(scope: Construct, id: string, props: MesaSolicitudesStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    const table = this.createTable(isProd);
    const { userPool, client } = this.createIdentity(isProd);
    const api = this.createApi(table, userPool, client);
    const site = this.createFrontend(api, isProd);

    new CfnOutput(this, 'SiteUrl', { value: `https://${site.distributionDomainName}` });
    new CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
  }

  private createTable(isProd: boolean): dynamodb.TableV2 {
    return new dynamodb.TableV2(this, 'ServiceRequests', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: isProd,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
          projectionType: dynamodb.ProjectionType.INCLUDE,
          nonKeyAttributes: SUMMARY_ATTRIBUTES,
        },
      ],
    });
  }

  private createIdentity(isProd: boolean) {
    const userPool = new cognito.UserPool(this, 'Users', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: { minLength: 12, requireSymbols: true },
      mfa: cognito.Mfa.OPTIONAL,
      customAttributes: {
        tenantId: new cognito.StringAttribute({ mutable: false, minLen: 1, maxLen: 64 }),
        role: new cognito.StringAttribute({ mutable: true, minLen: 1, maxLen: 32 }),
      },
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });
    const client = userPool.addClient('WebClient', {
      authFlows: { userSrp: true },
      generateSecret: false,
      preventUserExistenceErrors: true,
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, fullname: true })
        .withCustomAttributes('tenantId', 'role'),
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({ fullname: true }),
    });
    return { userPool, client };
  }

  private createApi(
    table: dynamodb.TableV2,
    userPool: cognito.UserPool,
    client: cognito.UserPoolClient,
  ): apigw.HttpApi {
    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;
    const fn = new NodejsFunction(this, 'ApiFunction', {
      entry: fileURLToPath(new URL('../../api/src/lambda.ts', import.meta.url)),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(10),
      tracing: lambda.Tracing.ACTIVE,
      logGroup: new logs.LogGroup(this, 'ApiLogs', {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      environment: {
        TABLE_NAME: table.tableName,
        AUTH_MODE: 'jwks',
        AUTH_JWKS_URL: `${issuer}/.well-known/jwks.json`,
        AUTH_ISSUER: issuer,
        AUTH_AUDIENCE: client.userPoolClientId,
        CORS_ORIGINS: '',
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        sourceMap: true,
        minify: true,
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });
    table.grantReadWriteData(fn);

    const api = new apigw.HttpApi(this, 'HttpApi', { createDefaultStage: false });
    api.addStage('default', {
      stageName: '$default',
      autoDeploy: true,
      throttle: { rateLimit: 50, burstLimit: 100 },
    });
    api.addRoutes({
      path: '/api/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', fn),
    });
    return api;
  }

  private createFrontend(api: apigw.HttpApi, isProd: boolean): cloudfront.Distribution {
    const bucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });
    const apiDomain = Fn.select(2, Fn.split('/', api.apiEndpoint));
    // Rutas del SPA (sin extensión) -> index.html. No se usan errorResponses porque
    // aplican a toda la distribución y convertirían los 404 de la API en 200.
    const spaRewrite = new cloudfront.Function(this, 'SpaRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        "function handler(event) { var r = event.request; if (!r.uri.includes('.')) { r.uri = '/index.html'; } return r; }",
      ),
    });

    return new cloudfront.Distribution(this, 'WebDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        functionAssociations: [{ function: spaRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(apiDomain),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
    });
  }
}
