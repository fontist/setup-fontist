#!/usr/bin/env node
import { $ } from "execa";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as github from "@actions/github";
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated";
import * as semver from "semver";
import { delimiter, join } from "node:path";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as cache from "@actions/cache"
import * as glob from "@actions/glob"

const githubPath = await readFile(
  join(process.env.RUNNER_TEMP!, "setup-fontist/GITHUB_PATH"),
  "utf8",
);
const githubPathItems = githubPath.trimEnd().split(/\r?\n/);
process.env.PATH = [process.env.PATH, ...githubPathItems].join(delimiter);

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
core.debug(`Resolved version: v${version}`);
if (!version) throw new DOMException(`${versionRaw} resolved to ${version}`);

let found = tc.find("fontist", version);
let cacheHit = !!found
if (!found) {
  let cacheDir = join(process.env.RUNNER_TEMP!, Math.random().toString());
  await mkdir(cacheDir);
  cacheDir = await tc.cacheDir(cacheDir, "fontist", version);
  try {
    await $({
      stdio: "inherit",
    })`gem install fontist --version ${version} --install-dir ${join(cacheDir, "install-dir")} --bindir ${join(cacheDir, "bindir")}`;

    await mkdir(join(cacheDir, "bin"));
    const bash = `\
#!/bin/bash
export GEM_PATH=${join(cacheDir, "install-dir")}
export GEM_HOME=${join(cacheDir, "install-dir")}
exec ${join(cacheDir, "bindir", "fontist")} "$@"`
    const cmd = `\
@echo off
set GEM_PATH=${join(cacheDir, "install-dir")}
set GEM_HOME=${join(cacheDir, "install-dir")}
${join(cacheDir, "bindir", "fontist")} %*`
    await writeFile(join(cacheDir, "bin", "fontist"), bash)
    await writeFile(join(cacheDir, "bin", "fontist.cmd"), cmd)
    await chmod(join(cacheDir, "bin", "fontist"), 0o755)
    await chmod(join(cacheDir, "bin", "fontist.cmd"), 0o755)
  } catch (error) {
    core.error(`Failure inside setup block. Removing tool cache folder.`);
    await rm(cacheDir, { recursive: true, force: true });
    throw error;
  }
  found = cacheDir;
}

core.addPath(join(found, "bin"));
core.setOutput("fontist-version", version);
core.info(`✅ Fontist v${version} installed!`);

if (core.getBooleanInput("cache")) {
  const cacheDir = join(process.env.HOME!, ".fontist")
  const primaryKey = `fontist-${github.context.ref}`
  core.saveState("cache-primary-key", primaryKey)
  const hitKey = await cache.restoreCache([cacheDir], primaryKey)
  core.saveState("cache-hit", hitKey)
  cacheHit ||= !!hitKey
}

core.setOutput("cache-hit", cacheHit)

core.info(`Running 'fontist update'...`)
await $({ stdio: "inherit" })`fontist update`;
