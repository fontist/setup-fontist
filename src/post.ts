#!/usr/bin/env node
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as glob from "@actions/glob";
import { join } from "node:path";

if (core.getBooleanInput("cache")) {
  const cacheDir = join(process.env.HOME!, ".fontist");
  const primaryKey = core.getState("cache-primary-key");
  if (primaryKey) {
    const hitKey = core.getState("cache-hit-key");
    core.info(`Saving ${cacheDir} with key ${primaryKey}`);
    await cache.saveCache([cacheDir], primaryKey);
  } else {
    core.info(`No cache key found, skipping cache save`)
  }
}

// This is an issue with '@actions/cache' somehow? https://github.com/actions/toolkit/issues/658
process.exit();
