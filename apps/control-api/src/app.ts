import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import { Pool } from "pg";
import { AppModule } from "./app.module";
import { ControlApiConfig } from "./config";
import { HttpErrorFilter } from "./http-error.filter";

export async function createControlApiApp(
  config: ControlApiConfig,
  pool: Pool,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config, pool),
    new FastifyAdapter({ trustProxy: true }),
  );
  app.useGlobalFilters(new HttpErrorFilter());

  await app.register(fastifyCookie as never);
  await app.register(fastifyRateLimit as never, {
    max: 20,
    timeWindow: "1 minute",
    global: false,
  });

  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
