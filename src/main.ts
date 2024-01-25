#!/usr/bin/env node
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import { join } from "node:path";
import * as semver from "semver";
import * as github from "@actions/github";
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated";
import { temporaryDirectory } from "tempy";
import { chmod, copyFile, mkdir, rename } from "node:fs/promises";
import {$  } from "execa"

const token = core.getInput("fontist-token");
const octokit = token
  ? github.getOctokit(token)
  : github.getOctokit(token, {
      authStrategy: createUnauthenticatedAuth,
      auth: { reason: "no 'fontist-token' input" },
    });

const versionRaw = core.getInput("fontist-version");
const releases = await octokit.paginate(octokit.rest.repos.listTags, {
owner: "fontist",
repo: "fontist",
});
const versions = releases.map((release) => release.name.slice(1));
const version = semver.maxSatisfying(versions, versionRaw === "latest" ? "*" : versionRaw)!;
core.debug(`Resolved version: v${version}`);
if (!version) throw new DOMException(`${versionRaw} resolved to ${version}`);

let found = tc.find("fontist", version);
core.setOutput("cache-hit", !!found);
if (!found) {
    const tempDir = join(process.env.RUNNER_TEMP!, Math.random().toString())
    await mkdir(tempDir)
    const installDir = join(tempDir, "install-dir")
    const bindir = join(tempDir, "bindir")

  await $`gem install fontist --version ${version} --install-dir ${installDir} --bindir ${bindir}`

  found = await tc.cacheDir(tempDir, "fontist", version);
  core.info(`fontist v${version} added to cache`);
}
core.addPath(join(found, "bindir"));
core.setOutput("fontist-version", version);
core.info(`✅ Fontist v${version} installed!`);
