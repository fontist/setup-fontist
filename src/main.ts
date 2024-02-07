#!/usr/bin/env node
import { $ } from "execa";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as github from "@actions/github";
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated";
import * as semver from "semver";
import { delimiter, join } from "node:path";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as cache from "@actions/cache";
import * as glob from "@actions/glob";
import assert from "node:assert/strict";

const token = core.getInput("fontist-token");
const octokit = token
  ? github.getOctokit(token)
  : github.getOctokit(undefined!, {
      authStrategy: createUnauthenticatedAuth,
      auth: { reason: "no 'fontist-token' input" },
    });

const versionRaw = core.getInput("fontist-version");
const versionRange = versionRaw === "latest" ? "*" : versionRaw;
const tags = await octokit.paginate(octokit.rest.repos.listTags, {
  owner: "fontist",
  repo: "fontist",
});
const versions = tags.map((tag) => tag.name.slice(1));
const version = semver.maxSatisfying(versions, versionRange);
assert(
  version,
  `${versionRange} didn't match any ${JSON.stringify(versions)}}`,
);
core.info(`Resolved version: v${version}`);

const workflowCache = core.getBooleanInput("cache");
const installationKey = `fontist-${version}-installation`;

let found = tc.find("fontist", version);
let cacheHit = !!found;
if (!found) {
  core.info(`Fontist v${version} not found in tool cache.`);

  const tempDir = join(process.env.RUNNER_TEMP!, Math.random().toString());
  await mkdir(tempDir);

  core.info(
    `Attempting to restore Fontist installatioin from workflow cache: ${installationKey}`,
  );
  const hitKey = await cache.restoreCache([tempDir], installationKey);
  if (hitKey) {
    core.info(`Restored Fontist installation from workflow cache: ${tempDir}`);
    found = await tc.cacheDir(tempDir, "fontist", version);
  }
}
cacheHit ||= !!found;

if (!found) {
  core.info(`Fontist v${version} not found in workflow cache.`);

  const tempDir = join(process.env.RUNNER_TEMP!, Math.random().toString());
  await mkdir(tempDir);

  core.info(`Using RubyGems to install Fontist v${version}...`);
  core.info(`Installing to ${join(tempDir, "install-dir")}`);
  core.info(`Installing binaries to ${join(tempDir, "bindir")}`);
  await $({
    stdio: "inherit",
  })`gem install fontist --version ${version} --no-document --install-dir ${join(tempDir, "install-dir")} --bindir ${join(tempDir, "bindir")}`;

  core.info(`Creating wrapper scripts in ${join(tempDir, "bin")}...`);
  await mkdir(join(tempDir, "bin"));

  const bash = `\
#!/bin/bash
export GEM_PATH='${join(tempDir, "install-dir")}'
export GEM_HOME='${join(tempDir, "install-dir")}'
exec ${join(tempDir, "bindir", "fontist")} "$@"`;
  await writeFile(join(tempDir, "bin", "fontist"), bash);
  await chmod(join(tempDir, "bin", "fontist"), 0o755);

  const cmd = `\
@echo off\r
set GEM_PATH=${join(tempDir, "install-dir")}\r
set GEM_HOME=${join(tempDir, "install-dir")}\r
${join(tempDir, "bindir", "fontist")} %*`;
  await writeFile(join(tempDir, "bin", "fontist.cmd"), cmd);

  found = await tc.cacheDir(tempDir, "fontist", version);
}

if (workflowCache) {
  core.info(`Caching Fontist installation in workflow cache...`);
  await cache.saveCache([found], installationKey);
}

core.addPath(join(found, "bin"));
core.setOutput("fontist-version", version);
core.info(`✅ Fontist v${version} installed!`);

if (workflowCache) {
  const cacheDir = join(process.env.HOME!, ".fontist");
  const cacheDependencyPath = core.getInput("cache-dependency-path");
  const hash = await glob.hashFiles(cacheDependencyPath);
  if (hash) {
    const dataKey = `fontist-${version}-data-${hash}`;
    core.saveState("cache-data-key", dataKey);
    core.info(
      `Attempting to restore ~/.fontist from workflow cache: ${dataKey}`,
    );
    const hitKey = await cache.restoreCache([cacheDir], dataKey);
    cacheHit ||= !!hitKey;
  } else {
    core.info(`No files matched ${cacheDependencyPath}`);
  }
}

core.info(`Running 'fontist update'...`);
await $({ stdio: "inherit" })`fontist update`;

// '@actions/cache' hangs unless we do this.
process.exit();
