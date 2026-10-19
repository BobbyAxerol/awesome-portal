/**
 * Drives the Playwright stub exactly as Playwright does: a fake `page` records the
 * handler `stubExecutionBff` registers, and a fake `route` records what that handler
 * fulfils. This is the "old path" the golden file was captured from.
 */
import type { Page } from "@playwright/test";

import { stubExecutionBff, type BffDoubleOptions } from "../../e2e/bffDouble";
import type { Driver, Observed } from "./matrix";

type Fulfil = { status?: number; contentType?: string; body?: string };
type Handler = (route: unknown) => unknown;

export async function stubDriver(options: BffDoubleOptions): Promise<Driver> {
  const handlers: { pattern: string; handler: Handler }[] = [];
  const page = {
    route: async (pattern: string, handler: Handler) => {
      handlers.push({ pattern, handler });
    },
  } as unknown as Page;
  await stubExecutionBff(page, options);
  if (handlers.length !== 1 || handlers[0]!.pattern !== "**/api/v1/execution/**") {
    throw new Error("stubExecutionBff must register exactly one route, **/api/v1/execution/**");
  }
  const handler = handlers[0]!.handler;
  return async (method, pathAndQuery) => {
    const captured: { value: Fulfil | null } = { value: null };
    const route = {
      request: () => ({ method: () => method, url: () => new URL(pathAndQuery, "http://portal.test").toString() }),
      fulfill: async (init: Fulfil) => {
        captured.value = init;
      },
    };
    await handler(route);
    if (captured.value === null) throw new Error("the stub did not fulfil");
    const seen: Observed = {
      status: captured.value.status ?? 0,
      contentType: captured.value.contentType ?? "",
      bodyText: captured.value.body ?? "",
    };
    return seen;
  };
}
