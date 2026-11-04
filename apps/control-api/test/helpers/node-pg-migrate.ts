/** Test-only access to the same supported CommonJS entrypoint as the CLI.
 * The package's conditional declarations cannot be resolved by this
 * project's legacy Node resolver; do not change the resolver for one tool. */
type MigrationOptions = {
  databaseUrl: string;
  dir: string;
  direction: "up";
  migrationsTable: string;
  count: number;
  noLock?: boolean;
  log: (line: string) => void;
};
export const migrate = (require("node-pg-migrate") as {
  runner: (options: MigrationOptions) => Promise<unknown>;
}).runner;
