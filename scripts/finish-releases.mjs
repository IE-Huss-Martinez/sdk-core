#!/usr/bin/env node
// Finishes the GitHub Release of every package version that's on npm: the
// tarball and SHA256SUMS attached, with an attestation (ADR 0021). It's safe
// to run again: it compares the current state on npm and GitHub, so a rerun or
// a later push repairs a release that an earlier, partly failed run left
// unfinished, and a complete release is left alone.
//
// Usage:
//   node scripts/finish-releases.mjs prepare <dir>
//   node scripts/finish-releases.mjs attach <dir>
//
// `prepare` looks at each public workspace package at its current version.
// Versions that aren't on npm, and releases that already have both files, are
// skipped. For the rest, it takes the tarball this run published (listed in
// $PUBLISHED_RECORD) or downloads it from the registry, verifies it against the
// registry's dist.integrity, and writes it with SHA256SUMS to <dir>. It sets
// `count` in $GITHUB_OUTPUT, so the workflow attests only those files.
//
// `attach` creates any missing release, from its existing tag and the
// changelog, and uploads the files in <dir>.
//
// It uses `npm` and `gh`, with GH_TOKEN and GITHUB_REPOSITORY from the
// workflow.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const print = (text) => process.stdout.write(`${text}\n`);
const fail = (text) => process.stderr.write(`${text}\n`);

const [command, dir] = process.argv.slice(2);
if (!["prepare", "attach"].includes(command ?? "") || !dir) {
  fail("Usage: node scripts/finish-releases.mjs <prepare|attach> <dir>");
  process.exit(2);
}
const repository = process.env.GITHUB_REPOSITORY;
if (!repository) {
  fail("GITHUB_REPOSITORY must be set, such as hussmartinez/sdk-core.");
  process.exit(2);
}

const run = (file, args) =>
  execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const SUMS = "SHA256SUMS";

/** The npm tarball name, such as hussmartinez-sdk-core-0.1.1.tgz. */
const tarballName = (name, version) => `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;

/** The registry's integrity for a version, or undefined when it isn't on npm. */
function registryIntegrity(name, version, { wait }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const integrity = run("npm", ["view", `${name}@${version}`, "dist.integrity"]);
      if (integrity) {
        return integrity;
      }
    } catch {
      // Not found, or not visible yet.
    }
    // A version published moments ago can take a little while to appear.
    if (!wait || attempt >= 12) {
      return undefined;
    }
    sleep(5_000);
  }
}

/** The release's asset names, or undefined when there's no release. */
function releaseAssets(tag) {
  try {
    const json = run("gh", ["release", "view", tag, "--repo", repository, "--json", "assets"]);
    return JSON.parse(json).assets.map((asset) => asset.name);
  } catch (error) {
    if (/release not found/i.test(String(error?.stderr ?? error))) {
      return undefined;
    }
    throw error;
  }
}

function integrityOf(file, algorithm) {
  return `${algorithm}-${createHash(algorithm).update(readFileSync(file)).digest("base64")}`;
}

function workspacePackages() {
  const packages = JSON.parse(run("pnpm", ["ls", "--recursive", "--depth", "-1", "--json"]));
  return packages.filter((pkg) => !pkg.private && pkg.name && pkg.version);
}

function publishedThisRun() {
  const record = process.env.PUBLISHED_RECORD;
  if (!record || !existsSync(record)) {
    return new Map();
  }
  const entries = readFileSync(record, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  return new Map(entries.map((entry) => [`${entry.name}@${entry.version}`, entry]));
}

function prepare() {
  const published = publishedThisRun();
  let count = 0;

  for (const pkg of workspacePackages()) {
    const tag = `${pkg.name}@${pkg.version}`;
    const thisRun = published.get(tag);
    const integrity = registryIntegrity(pkg.name, pkg.version, { wait: Boolean(thisRun) });
    if (!integrity) {
      print(`${tag}: not on npm, nothing to finish.`);
      continue;
    }

    const file = tarballName(pkg.name, pkg.version);
    const assets = releaseAssets(tag);
    if (assets?.includes(file) && assets.includes(SUMS)) {
      print(`${tag}: release complete.`);
      continue;
    }

    // Prefer the tarball this run published; otherwise download it.
    let source = thisRun?.tarball;
    if (!source || !existsSync(source)) {
      const downloads = mkdtempSync(join(tmpdir(), "finish-release-"));
      run("npm", ["pack", tag, "--pack-destination", downloads]);
      source = join(downloads, file);
    }
    const [algorithm] = integrity.split("-");
    const actual = integrityOf(source, algorithm);
    if (actual !== integrity) {
      throw new Error(
        `${tag}: the tarball doesn't match the registry (${actual} instead of ${integrity}).`,
      );
    }

    const target = join(dir, tag.replace(/^@/, "").replace("/", "__"));
    mkdirSync(target, { recursive: true });
    copyFileSync(source, join(target, file));
    const sha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
    writeFileSync(join(target, SUMS), `${sha256}  ./${file}\n`);
    writeFileSync(
      join(target, "release.json"),
      JSON.stringify({ tag, path: pkg.path, version: pkg.version, file, needsRelease: !assets }),
    );
    print(
      `${tag}: ${assets ? "attaching missing files" : "creating the release and attaching files"} (${thisRun ? "this run's tarball" : "downloaded from npm"}).`,
    );
    count += 1;
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `count=${count}\n`);
  }
  print(`Releases to finish: ${count}`);
}

/** The changelog section for a version, as release notes. */
function releaseNotes(path, version) {
  const changelog = join(path, "CHANGELOG.md");
  if (!existsSync(changelog)) {
    return "";
  }
  const lines = readFileSync(changelog, "utf8").split("\n");
  const start = lines.findIndex((line) => line.trim() === `## ${version}`);
  if (start === -1) {
    return "";
  }
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}

function attach() {
  if (!existsSync(dir)) {
    print("Nothing to attach.");
    return;
  }
  let failed = false;
  for (const entry of readdirSync(dir)) {
    const target = join(dir, entry);
    const meta = JSON.parse(readFileSync(join(target, "release.json"), "utf8"));
    try {
      if (meta.needsRelease) {
        // Only from an existing tag: a release must point at the commit that
        // was actually published, which only its tag records.
        const notes = join(target, "NOTES.md");
        writeFileSync(notes, releaseNotes(meta.path, meta.version));
        run("gh", [
          "release",
          "create",
          meta.tag,
          "--repo",
          repository,
          "--verify-tag",
          "--title",
          meta.tag,
          "--notes-file",
          notes,
        ]);
        print(`${meta.tag}: release created.`);
      }
      run("gh", [
        "release",
        "upload",
        meta.tag,
        join(target, meta.file),
        join(target, SUMS),
        "--repo",
        repository,
        "--clobber",
      ]);
      print(`${meta.tag}: attached ${meta.file} and ${SUMS}.`);
    } catch (error) {
      failed = true;
      fail(`${meta.tag}: ${String(error?.stderr || error?.message || error).trim()}`);
    }
  }
  if (failed) {
    process.exit(1);
  }
}

try {
  if (command === "prepare") {
    prepare();
  } else {
    attach();
  }
} catch (error) {
  fail(String(error?.message ?? error));
  process.exit(1);
}
