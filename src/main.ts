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

const token = core.getInput("fontist-token");
const octokit = token
  ? github.getOctokit(token)
  : github.getOctokit(undefined!, {
      authStrategy: createUnauthenticatedAuth,
      auth: { reason: "no 'fontist-token' input" },
    });

const versionRaw = core.getInput("fontist-version");
const tags = await octokit.paginate(octokit.rest.repos.listTags, {
  owner: "fontist",
  repo: "fontist",
});
const versions = tags.map((tag) => tag.name.slice(1));
const version = semver.maxSatisfying(
  versions,
  versionRaw === "latest" ? "*" : versionRaw,
)!;
core.info(`Resolved version: v${version}`);
if (!version) throw new DOMException(`${versionRaw} resolved to ${version}`);

const workflowCache = core.getBooleanInput("cache");
if (workflowCache) {
  core.info(`Using @actions/cache`);
}

let found: string;
let cacheHit = false;
install_fontist: {
  found = tc.find("fontist", version);
  if (found) {
    core.info(`Found Fontist in tool cache: ${found}`);
    cacheHit = true;
    break install_fontist;
  }

  let cacheDir = join(process.env.RUNNER_TEMP!, Math.random().toString());
  await mkdir(cacheDir);
  cacheDir = await tc.cacheDir(cacheDir, "fontist", version);
  try {
    if (workflowCache) {
      const primaryKey = `fontist-${version}-tool-cache`;
      core.info(`Attempting to restore from ${primaryKey}`)
      const hitKey = await cache.restoreCache([cacheDir], primaryKey);
      if (hitKey) {
        core.info(`Restored Fontist from workflow cache: ${cacheDir}`)
        found = cacheDir;
        cacheHit = true;
        break install_fontist;
      }
    }

    core.info(`Using RubyGems to install Fontist v${version}...`)
    core.info(`Installing to ${join(cacheDir, "install-dir")}`)
    core.info(`Installing binaries to ${join(cacheDir, "bindir")}`)
    await $({
      stdio: "inherit",
    })`gem install fontist --version ${version} --no-document --install-dir ${join(cacheDir, "install-dir")} --bindir ${join(cacheDir, "bindir")}`;

    core.info(`Creating wrapper scripts in ${join(cacheDir, "bin")}...`)
    await mkdir(join(cacheDir, "bin"));

    const bash = `\
#!/bin/bash
export GEM_PATH=${join(cacheDir, "install-dir")}
export GEM_HOME=${join(cacheDir, "install-dir")}
exec ${join(cacheDir, "bindir", "fontist")} "$@"`;
    await writeFile(join(cacheDir, "bin", "fontist"), bash);
    await chmod(join(cacheDir, "bin", "fontist"), 0o755);

    const cmd = `\
@echo off\r
set GEM_PATH=${join(cacheDir, "install-dir")}\r
set GEM_HOME=${join(cacheDir, "install-dir")}\r
${join(cacheDir, "bindir", "fontist")} %*`;
    await writeFile(join(cacheDir, "bin", "fontist.cmd"), cmd);

  } catch (error) {
    await rm(cacheDir, { recursive: true, force: true });
    throw error;
  }

  if (workflowCache) {
    core.info(`Trying to stash ${cacheDir} in workflow cache`)
    await cache.saveCache([cacheDir], `fontist-${version}-tool-cache`);
  }
}

core.addPath(join(found, "bin"));
core.setOutput("fontist-version", version);
core.info(`✅ Fontist v${version} installed!`);

if (workflowCache) {
  const cacheDir = join(process.env.HOME!, ".fontist");
  const hash = await glob.hashFiles(core.getInput("cache-dependency-path"))
  if (hash) {
    const primaryKey = `fontist-${version}-home-fontist-${hash}`;
    core.saveState("cache-primary-key", primaryKey);
    core.info(`Attempting to restore ${cacheDir} from ${primaryKey}`);
    const hitKey = await cache.restoreCache([cacheDir], primaryKey);
    core.saveState("cache-hit", hitKey);
    if (hitKey) {
      core.info(`Restored ${cacheDir} from workflow cache: ${hitKey}`);
      cacheHit = true;
    }
  } else {
    core.info(`No manifest files found, skipping cache restore`);
    core.info(`To enable cache, set the cache-dependency-path input OR create a manifest.yml file`)
  }
}

core.setOutput("cache-hit", cacheHit);

core.info(`Running 'fontist update'...`);
await $({ stdio: "inherit" })`fontist update`;

// This is an issue with '@actions/cache' somehow? https://github.com/actions/toolkit/issues/658
process.exit();
