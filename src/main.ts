#!/usr/bin/env node
import { $ } from "execa"
import * as core from "@actions/core"
import * as tc from "@actions/tool-cache"
import * as github from "@actions/github"
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated"
import * as semver from "semver"
import { join } from "node:path"
import { mkdir, rm } from "node:fs/promises"

// Make sure it's still 'dist/index.js' when you change this!
const setupRubyTag = 'v1.170.0'

const token = core.getInput("fontist-token");
const octokit = token
  ? github.getOctokit(token)
  : github.getOctokit(undefined!, {
      authStrategy: createUnauthenticatedAuth,
      auth: { reason: "no 'fontist-token' input" },
    });

const versionRaw = core.getInput("fontist-version");
let version: string;
if (versionRaw === "latest") {
  const { data } = await octokit.rest.repos.getLatestRelease({
    owner: "fontist",
    repo: "fontist",
  });
  version = data.tag_name.slice(1);
} else {
  const releases = await octokit.paginate(octokit.rest.repos.listReleases, {
    owner: "fontist",
    repo: "fontist",
  });
  const versions = releases.map((release) => release.tag_name.slice(1));
  version = semver.maxSatisfying(versions, versionRaw)!;
}
core.debug(`Resolved version: v${version}`);
if (!version) throw new DOMException(`${versionRaw} resolved to ${version}`);

let found = tc.find("fontist", version);
core.setOutput("cache-hit", !!found)
if (!found) {
  let setupRubyPath = await tc.downloadTool(`https://github.com/ruby/setup-ruby/archive/refs/tags/${setupRubyTag}.zip`)
  setupRubyPath = await tc.extractZip(setupRubyPath)

  const tempDir =join(process.env.RUNNER_TEMP!, Math.random().toString())
  await mkdir(tempDir);

  let cacheDir = join(process.env.RUNNER_TEMP!, Math.random().toString())
  await mkdir(cacheDir);
  cacheDir = await tc.cacheDir(cacheDir, "fontist", version)
  try {
    const { all } = await $({
      env: {
        RUNNER_TOOL_CACHE: join(cacheDir, "setup-ruby-tool-cache"),
        GITHUB_PATH: join(tempDir, "GITHUB_PATH"),
        GITHUB_ENV: join(tempDir, "GITHUB_ENV"),
      },
      all: true
    })`${process.execPath} ${setupRubyPath}/dist/index.js`
    // Escaped so that "::command::options" isn't interpreted as a command.
    console.error(JSON.stringify(all))
  } catch (error) {
    await rm(cacheDir, { recursive: true, force: true })
    throw error
  }
}
