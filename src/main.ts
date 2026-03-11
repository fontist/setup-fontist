#!/usr/bin/env node
import { $ } from "execa";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as semver from "semver";
import { delimiter, join } from "node:path";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as cache from "@actions/cache";
import * as glob from "@actions/glob";
import assert from "node:assert/strict";

// Configure git to use GitHub token for github.com
const githubToken = core.getInput("github-token");
if (githubToken) {
  core.info("Configuring git to use GitHub token for github.com...");
  // Set up git credential helper for github.com
  await $`git config --global credential.helper store`;
  await $`echo https://x-access-token:${githubToken}@github.com >> ~/.git-credentials`;
  // Also configure for submodules and other git operations
  await $`git config --global url.https://x-access-token:${githubToken}@github.com/.insteadOf https://github.com/`;
}

const response = await fetch("https://rubygems.org/api/v1/versions/fontist.json");
if (response.status !== 200) {
  throw new Error(`${response.url} returned ${response.status}`);
}
if (!response.headers.get("Content-Type")?.includes("application/json")) {
  throw new Error(`${response.url} did not return application/json`);
}
const json = await response.json() as { prerelease: boolean; number: string }[];
const versions = json
  .filter((entry) => !entry.prerelease)
  .map((entry) => entry.number);

const versionRaw = core.getInput("fontist-version");
const versionRange = versionRaw === "latest" ? "*" : versionRaw;
const version = semver.maxSatisfying(versions, versionRange);
assert(
  version,
  `${versionRange} didn't match any ${JSON.stringify(versions)}}`,
);
core.info(`Resolved version: v${version}`);

let found = tc.find("fontist", version);
let cacheHit = !!found;

const workflowCache = core.getBooleanInput("cache");
const keyPrefix = `fontist-${version}-${process.env.RUNNER_OS}`
const installationKey = `${keyPrefix}-installation`;

if (found) {
  core.info(`Fontist v${version} found in tool cache!`);
} else {
  core.info(`Fontist v${version} not found in tool cache.`);

  const tempDir = join(process.env.RUNNER_TEMP!, Math.random().toString());
  await mkdir(tempDir);

  core.info(
    `Attempting to restore Fontist installation from workflow cache: ${installationKey}`,
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

  const installDir = join(tempDir, "install-dir");
  const bindir = join(tempDir, "bindir");

  core.info(`Using RubyGems to install Fontist v${version}...`);
  core.info(`Installing to ${installDir}`);
  core.info(`Installing binaries to ${bindir}`);
  await $({
    stdio: "inherit",
  })`gem install fontist --version ${version} --no-document --install-dir ${installDir} --bindir ${bindir}`;

  found = await tc.cacheDir(tempDir, "fontist", version);
}
const installDir = join(found, "install-dir")
const bindir = join(found, "bindir");

if (workflowCache) {
  core.info(`Caching Fontist installation in workflow cache...`);
  await cache.saveCache([found], installationKey);
}

const wrappers = join(found, "wrappers");
core.info(`Creating wrapper scripts in ${wrappers}...`);
await mkdir(wrappers, { recursive: true });

const bash = `\
#!/bin/bash
export GEM_PATH='${installDir}'
export GEM_HOME='${installDir}'
exec '${join(bindir, "fontist")}' "$@"`;
await writeFile(join(wrappers, "fontist"), bash);
await chmod(join(wrappers, "fontist"), 0o755);

const cmd = `\
@echo off\r
set GEM_PATH=${installDir}\r
set GEM_HOME=${installDir}\r
${join(bindir, "fontist")} %*`;
await writeFile(join(wrappers, "fontist.cmd"), cmd);

core.addPath(wrappers);
core.setOutput("fontist-version", version);
core.info(`✅ Fontist v${version} installed!`);

if (workflowCache) {
  const cacheDir = join(process.env.HOME!, ".fontist");
  const cacheDependencyPath = core.getInput("cache-dependency-path");
  const hash = await glob.hashFiles(cacheDependencyPath);
  if (hash) {
    const dataKey = `${keyPrefix}-data-${hash}`;
    core.saveState("data-key", dataKey);
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
try {
  await $({ stdio: "inherit" })`fontist update`;
} catch {
  core.info("'fontist update' failed, clearing formulas and retrying...");
  const formulasDir = join(process.env.HOME!, ".fontist", "versions", "v4", "formulas");
  await rm(formulasDir, { recursive: true, force: true });
  await $({ stdio: "inherit" })`fontist update`;
}

// Set up private formula repositories
const formulaRepos = core.getInput("formula-repos");
if (formulaRepos) {
  const repos = formulaRepos.trim().split("\n").filter(Boolean);
  for (const line of repos) {
    const [name, url] = line.trim().split(/\s+/, 2);
    if (name && url) {
      core.info(`Setting up formula repository: ${name} -> ${url}`);
      await $({ stdio: "inherit" })`fontist repo setup ${name} ${url}`;
    }
  }
}

// '@actions/cache' hangs unless we do this.
process.exit();
