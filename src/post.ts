#!/usr/bin/env node
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as glob from "@actions/glob";
import { join } from "node:path";

if (core.getBooleanInput("cache")) {
  const cacheDir = join(process.env.HOME!, ".fontist");
  const primaryKey = core.getState("cache-primary-key");
  const hitKey = core.getState("cache-hit-key");
  core.info(`Saving ${cacheDir} with key ${primaryKey}`);
  await cache.saveCache([cacheDir], primaryKey);
}

process.exit();
