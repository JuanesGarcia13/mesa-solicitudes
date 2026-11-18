import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, it } from 'vitest';
import { MesaSolicitudesStack } from '../lib/mesa-solicitudes-stack.js';

describe('MesaSolicitudesStack', () => {
  let template: Template;

  beforeAll(() => {
    // Sin bundling de la Lambda: las pruebas validan la topología, no el empaquetado.
    const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
    const stack = new MesaSolicitudesStack(app, 'Test', { stage: 'test', env: { region: 'us-east-1' } });
    template = Template.fromStack(stack);
  });

  it('creates the single table with the tenant+status index projecting only list attributes', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        Match.objectLike({
          IndexName: 'GSI1',
          Projection: Match.objectLike({ ProjectionType: 'INCLUDE' }),
        }),
      ],
    });
  });

  it('runs the API with a real identity provider instead of the simulated one', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
      Environment: { Variables: Match.objectLike({ AUTH_MODE: 'jwks' }) },
    });
  });

  it('keeps tenantId immutable in Cognito', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Schema: Match.arrayWith([Match.objectLike({ Name: 'tenantId', Mutable: false })]),
    });
  });

  it('never exposes the frontend bucket publicly', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
});
