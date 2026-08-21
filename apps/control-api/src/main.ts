import "reflect-metadata";
import { loadConfig } from "./config";
import { buildPool } from "./db/pool";
import { createControlApiApp } from "./app";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const pool = buildPool(config.DATABASE_URL);
  const app = await createControlApiApp(config, pool);
  app.enableShutdownHooks();
  const port = Number(process.env.CONTROL_API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
