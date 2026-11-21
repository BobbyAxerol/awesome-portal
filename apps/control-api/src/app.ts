import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyRateLimit from "@fastify/rate-limit";
import { Pool } from "pg";
import { AppModule, type ControlApiDependencies } from "./app.module";
import { ControlApiConfig } from "./config";
import { HttpErrorFilter } from "./http-error.filter";
import type { NativeCoreApplicationOwner } from "./execution-v2/native-core-bootstrap";

export async function createControlApiApp(
  config: ControlApiConfig,
  pool: Pool,
  executionPool?: Pool,
  dependencies?: ControlApiDependencies,
  nativeOwner?: NativeCoreApplicationOwner,
): Promise<NestFastifyApplication> {
  if (nativeOwner && (!nativeOwner.usesPool(pool) || !dependencies?.nativeManagerRead))
    throw new Error("NATIVE_BOOTSTRAP_OWNER_COMPOSITION_REQUIRED");
  nativeOwner?.beginApplicationConstruction();
  let app: NestFastifyApplication | undefined;
  try {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule.register(config, pool, executionPool, dependencies),
      new FastifyAdapter({ trustProxy: true, routerOptions: { maxParamLength: 256 } }),   // request_key may be 192 chars (BE-P13 lookup)
      // Route-discovery logs drown the actual Vitest result in CI. Legacy
      // production keeps Nest logging; the isolated test app is silent.
      // Selected native bootstrap is a single process-owned app. Nest's public
      // logger option changes its process-wide logger; suppress it deliberately
      // before dependency construction so private transport errors cannot print.
      // Main reports only a fixed failure category. Legacy logging is unchanged.
      config.NODE_ENV === "test" || nativeOwner ? { logger: false, abortOnError: false } : {},
    );
    nativeOwner?.captureApplication(app);
    app.useGlobalFilters(new HttpErrorFilter());

    // Alpha import posts multipart bodies; the façade forwards them as raw
    // buffers so the alpha service stays the only authority that parses them.
    app
      .getHttpAdapter()
      .getInstance()
      .addContentTypeParser(
        "multipart/form-data",
        { parseAs: "buffer" },
        (_, body, done) => done(null, body),
      );

    await app.register(fastifyCookie as never);
    await app.register(fastifyRateLimit as never, {
      max: 20,
      timeWindow: "1 minute",
      global: false,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  } catch (error) {
    if (nativeOwner) return nativeOwner.failStartup(error);
    // A private listener may initialize before a different provider fails.
    // Dispose through the same lifecycle, never leave a listening orphan or
    // report pending work as drained. The unconfigured default is unchanged.
    if (dependencies?.currentViewRuntime && app) await app.close();
    throw error;
  }
}
