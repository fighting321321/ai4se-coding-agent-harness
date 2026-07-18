import { describe, expect, it } from "vitest";

import { healthStatus } from "../../../apps/api/src/health";

describe("healthStatus", () => {
  it("返回正常状态", () => {
    expect(healthStatus()).toEqual({ status: "ok" });
  });
});
