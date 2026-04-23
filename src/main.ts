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

// Check if Ruby is available and meets minimum version requirement
const minRubyVersion = "3.2.0";
try {
  const { stdout: rubyVersionOutput } = await $`ruby --version`;
  const match = rubyVersionOutput.match(/ruby (\d+\.\d+\.\d+)/);
  if (!match) {
    core.setFailed(
      `Could not parse Ruby version from: ${rubyVersionOutput.trim()}`
    );
    process.exit(1);
  }
  const version = match[1];

  if (semver.lt(version, minRubyVersion)) {
    core.setFailed(
      `Ruby ${minRubyVersion}+ is required, but found Ruby ${version}.\n\n` +
      `Please add this step before using fontist/setup-fontist:\n\n` +
      `  - uses: ruby/setup-ruby@v1\n` +
      `    with:\n` +
      `      ruby-version: "3.2"\n`
    );
    process.exit(1);
  }

  core.info(`Found Ruby ${version} (minimum required: ${minRubyVersion})`);
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (errorMessage.includes("command not found") || errorMessage.includes("ENOENT")) {
    core.setFailed(
      "Ruby is required but not installed.\n\n" +
      "Please add this step:\n" +
      "  - uses: ruby/setup-ruby@v1\n" +
      "    with:\n" +
      "      ruby-version: '3.2'"
    );
  } else {
    core.setFailed(
      "Ruby is required but not installed. Please ensure Ruby is available on the runner. " +
      "GitHub-hosted runners include Ruby by default. For self-hosted runners, install Ruby first."
    );
  }
  process.exit(1);
}

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
let installationCacheRestored = false;
let installedThisRun = false;

const workflowCache = core.getBooleanInput("cache");
const keyPrefix = `fontist-${version}-${process.env.RUNNER_OS}`
const installationKey = `${keyPrefix}-installation`;
const installationCacheDir = join(
  process.env.RUNNER_TEMP!,
  `setup-fontist-installation-${version}`,
);

if (found) {
  core.info(`Fontist v${version} found in tool cache!`);
} else {
  core.info(`Fontist v${version} not found in tool cache.`);

  await rm(installationCacheDir, { recursive: true, force: true });
  await mkdir(installationCacheDir, { recursive: true });

  core.info(
    `Attempting to restore Fontist installation from workflow cache: ${installationKey}`,
  );
  const hitKey = await cache.restoreCache([installationCacheDir], installationKey);
  installationCacheRestored = !!hitKey;
  if (hitKey) {
    core.info(`Restored Fontist installation from workflow cache: ${installationCacheDir}`);
    found = await tc.cacheDir(installationCacheDir, "fontist", version);
  }
}
cacheHit ||= !!found;

if (!found) {
  core.info(`Fontist v${version} not found in workflow cache.`);

  await rm(installationCacheDir, { recursive: true, force: true });
  await mkdir(installationCacheDir, { recursive: true });

  const installDir = join(installationCacheDir, "install-dir");
  const bindir = join(installationCacheDir, "bindir");

  core.info(`Using RubyGems to install Fontist v${version}...`);
  core.info(`Installing to ${installDir}`);
  core.info(`Installing binaries to ${bindir}`);

  try {
    await $({
      stdio: "inherit",
    })`gem install fontist --version ${version} --no-document --install-dir ${installDir} --bindir ${bindir}`;
  } catch (error) {
    const isWindows = process.platform === "win32";
    const errorMessage = error instanceof Error ? error.message : String(error);

    let helpMessage = `Failed to install Fontist v${version} via RubyGems.\n\n`;
    helpMessage += `Error: ${errorMessage}\n\n`;

    if (isWindows && errorMessage.includes("native extension")) {
      helpMessage += `This appears to be a Windows native extension build failure.\n`;
      helpMessage += `Try installing a specific Ruby version first:\n\n`;
      helpMessage += `  - uses: ruby/setup-ruby@v1\n`;
      helpMessage += `    with:\n`;
      helpMessage += `      ruby-version: "3.4"\n\n`;
      helpMessage += `See https://github.com/fontist/setup-fontist/issues/17 for more details.`;
    } else if (errorMessage.includes("conflicting dependencies") || errorMessage.includes("Gem::DependencyResolutionError")) {
      helpMessage += `This appears to be a Ruby dependency conflict.\n`;
      helpMessage += `Try installing a newer Ruby version first:\n\n`;
      helpMessage += `  - uses: ruby/setup-ruby@v1\n`;
      helpMessage += `    with:\n`;
      helpMessage += `      ruby-version: "3.4"\n`;
    } else {
      helpMessage += `Please ensure Ruby and build tools are properly installed.`;
    }

    core.setFailed(helpMessage);
    process.exit(1);
  }

  found = await tc.cacheDir(installationCacheDir, "fontist", version);
  installedThisRun = true;
}
const installDir = join(found, "install-dir")
const bindir = join(found, "bindir");

if (workflowCache && installedThisRun && !installationCacheRestored) {
  core.info(`Caching Fontist installation in workflow cache...`);
  try {
    await cache.saveCache([installationCacheDir], installationKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unable to reserve cache with key")) {
      core.info(
        `Installation cache save skipped because key is already being created: ${installationKey}`,
      );
    } else {
      core.warning(`Installation cache save failed: ${message}`);
    }
  }
} else if (workflowCache) {
  core.info(
    `Skipping installation cache save.`,
  );
}

const wrappers = join(found, "wrappers");
core.info(`Creating wrapper scripts in ${wrappers}...`);
await mkdir(wrappers, { recursive: true });

const bash = `\
#!/bin/bash
export GEM_PATH='${installDir}'
export GEM_HOME='${installDir}'
exec ruby '${join(bindir, "fontist")}' "$@"`;
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
core.setOutput("cache-hit", String(cacheHit));
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