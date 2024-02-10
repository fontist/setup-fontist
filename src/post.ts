#!/usr/bin/env node
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as glob from "@actions/glob";
import { join } from "node:path";

if (core.getBooleanInput("cache")) {
  const cacheDir = join(process.env.HOME!, ".fontist");
  const dataKey = core.getState("data-key");
  if (dataKey) {
    core.info(`Saving ${cacheDir} with key ${dataKey}`);
    await cache.saveCache([cacheDir], dataKey);
  } else {
    core.info(`No 'data-key' value. Skipping save.`);
  }
}

// '@actions/cache' hangs unless we do this.
process.exit();
