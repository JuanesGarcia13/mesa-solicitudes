import { App, Tags } from 'aws-cdk-lib';
import { MesaSolicitudesStack } from '../lib/mesa-solicitudes-stack.js';

const app = new App();
const stage = app.node.tryGetContext('stage') ?? 'dev';

const stack = new MesaSolicitudesStack(app, `MesaSolicitudes-${stage}`, {
  stage,
  env: {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] ?? 'us-east-1',
  },
});

Tags.of(stack).add('project', 'mesa-solicitudes');
Tags.of(stack).add('stage', stage);
