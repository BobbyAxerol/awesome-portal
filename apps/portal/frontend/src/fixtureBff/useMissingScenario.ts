/**
 * Import for its side effect from a test that asserts the FORMER default (deliberate typed absences, true zeros, PARTIAL quality, a degraded
 * Paper and a NOT_CONFIGURED Sandbox in the All lens, "variety on purpose" scores). WP-P moved that default behind `FIXTURE_SCENARIO=missing`;
 * the positive world is the new default, and `positiveWorld.test.ts` asserts it.
 */
import { afterAll, beforeEach } from "vitest";
import { resetScenario, setScenario } from "../../../fixture-bff/scenario";

beforeEach(() => setScenario("missing"));
afterAll(() => { resetScenario(); });
