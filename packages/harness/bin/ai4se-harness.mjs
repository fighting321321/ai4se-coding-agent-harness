#!/usr/bin/env node

import console from "node:console";
import process from "node:process";

import { runOfflineSmoke } from "../dist/offline-smoke.js";

try {
  console.log(await runOfflineSmoke());
} catch {
  console.error("AI4SE Harness 离线 smoke：failed");
  process.exitCode = 1;
}
