import { createApplication } from './composition-root.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await createApplication(config);

const shutdown = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: config.port, host: '0.0.0.0' });
