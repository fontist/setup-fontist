#!/usr/bin/env node
import { $ } from "execa"
import * as core from "@actions/core"
import * as tc from "@actions/tool-cache"
import * as github from "@actions/github"
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated"
import * as semver from "semver"
import { join } from "node:path"
import { mkdir, rm, writeFile } from "node:fs/promises"

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
const tags = await octokit.paginate(octokit.rest.repos.listTags, {
  owner: "fontist",
  repo: "fontist",
});
const versions = tags.map((tag) => tag.name);
const version = semver.maxSatisfying(versions, versionRaw === "latest" ? "*" : versionRaw)!;
core.debug(`Resolved version: v${version}`);
if (!version) throw new DOMException(`${versionRaw} resolved to ${version}`);

let found = tc.find("fontist", version);
core.setOutput("cache-hit", !!found)
if (!found) {
  core.info(`Downloading setup-ruby@${setupRubyTag}`)
  let setupRubyPath = await tc.downloadTool(`https://github.com/ruby/setup-ruby/archive/refs/tags/${setupRubyTag}.zip`)
  setupRubyPath = await tc.extractZip(setupRubyPath)
  setupRubyPath = join(setupRubyPath, `setup-ruby-${setupRubyTag.slice(1)}`)

  const tempDir =join(process.env.RUNNER_TEMP!, Math.random().toString())
  await mkdir(tempDir);

  let cacheDir = join(process.env.RUNNER_TEMP!, Math.random().toString())
  await mkdir(cacheDir);
  cacheDir = await tc.cacheDir(cacheDir, "fontist", version)
  try {
    const githubPath = join(tempDir, "GITHUB_PATH")
    await writeFile(githubPath, "")
    const githubEnv = join(tempDir, "GITHUB_ENV")
    await writeFile(githubEnv, "")
    const { all } = await $({
      env: {
        RUNNER_TOOL_CACHE: join(cacheDir, "setup-ruby-tool-cache"),
        GITHUB_PATH: githubPath,
        GITHUB_ENV: githubEnv,
        "INPUT_RUBY-VERSION": "ruby",
        "INPUT_BUNDLER-CACHE": "false",
      },
      all: true
    })`${process.execPath} ${setupRubyPath}/dist/index.js`
    // Escaped so that "::command::options" isn't interpreted as a command.
    console.error(JSON.stringify(all))
  } catch (error) {
    core.error(`Failure inside setup block. Removing tool cache folder.`)
    await rm(cacheDir, { recursive: true, force: true })
    throw error
  }
}
