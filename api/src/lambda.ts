import awsLambdaFastify from '@fastify/aws-lambda';
import { createApplication } from './composition-root.js';
import { loadConfig } from './config.js';

const app = await createApplication(loadConfig());
const proxy = awsLambdaFastify(app);
await app.ready();

/** Punto de entrada para AWS Lambda detrás de API Gateway HTTP API: la misma app que corre en local. */
export const handler = proxy;
