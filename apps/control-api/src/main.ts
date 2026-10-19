import "reflect-metadata";
import { loadConfig } from "./config";
import { buildPool } from "./db/pool";
import { createControlApiApp } from "./app";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "./execution-v2/native-core-runtime";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const reference = nativeCoreRuntimeReference();
  const native = reference ? await prepareNativeCoreRuntime(reference) : undefined;
  const pool = buildPool(config.DATABASE_URL, native?.poolProfile);
  const dependencies = native ? await native.compose(pool) : undefined;
  const app = await createControlApiApp(config, pool, undefined, dependencies);
  app.enableShutdownHooks();
  const port = Number(process.env.CONTROL_API_PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
