#!/usr/bin/env node

import { runOfflineSmoke } from "./offline-smoke.js";

try {
  console.log(await runOfflineSmoke());
} catch {
  console.error("AI4SE Harness 离线 smoke：failed");
  process.exitCode = 1;
}
