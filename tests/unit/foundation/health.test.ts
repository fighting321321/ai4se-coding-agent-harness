import { describe, expect, expectTypeOf, it } from "vitest";

import { healthStatus } from "../../../apps/api/src/health.js";

describe("healthStatus", () => {
  it("返回正常状态", () => {
    expect(healthStatus()).toEqual({ status: "ok" });
    expectTypeOf(healthStatus()).toEqualTypeOf<{ status: "ok" }>();
  });
});
