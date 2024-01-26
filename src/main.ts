#!/usr/bin/env node
import { $ } from "execa";
import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as github from "@actions/github";
import { createUnauthenticatedAuth } from "@octokit/auth-unauthenticated";
import * as semver from "semver";
import { delimiter, join } from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

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
core.setOutput("cache-hit", !!found);
if (!found) {
  const githubPath = await readFile(
    join(process.env.RUNNER_TEMP!, "GITHUB_PATH"),
    "utf8",
  );
  const githubPathItems = githubPath.trimEnd().split(/\r?\n/);
  const extraPath = githubPathItems.join(delimiter);

  let cacheDir = join(process.env.RUNNER_TEMP!, Math.random().toString());
  await mkdir(cacheDir);
  cacheDir = await tc.cacheDir(cacheDir, "fontist", version);
  try {
    await $({
      stdio: "inherit",
      env: {
        PATH: `${process.env.PATH}${delimiter}${extraPath}`,
      },
    })`gem install fontist --version ${version} --install-dir ${join(cacheDir, "install-dir")} --bindir ${join(cacheDir, "bindir")}`;
  } catch (error) {
    core.error(`Failure inside setup block. Removing tool cache folder.`);
    await rm(cacheDir, { recursive: true, force: true });
    throw error;
  }

  found = cacheDir;
}

core.addPath(join(found, "bindir"));
core.setOutput("fontist-version", version);
core.info(`✅ Fontist v${version} installed!`);

await $({ stdio: "inherit" })`fontist update`;
