/**
 * Entry point: `node dist/server.mjs` after `node build.mjs`. Configuration is environment variables
 * only (see README.md); this file reads them through `loadConfig`, which reads no file.
 */
import { ConfigError, createFixtureServer, loadConfig } from "./app";

let config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`fixture-bff: ${error.message}\n`);
    process.exit(2);
  }
  throw error;
}

const server = createFixtureServer(config);
server.listen(config.port, config.host, () => {
  const address = server.address();
  const port = address !== null && typeof address !== "string" ? address.port : config.port;
  process.stdout.write(
    `fixture-bff: ${config.laneLabel} on ${config.host}:${port} scale=${config.scale} now=${config.nowIso} writes=${config.writes} profile=${config.reviewProfile} (NOT acceptance evidence)\n`,
  );
});

function stop(): void {
  server.close(() => process.exit(0));
  // A connection that will not close must not keep a stopping container alive.
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
