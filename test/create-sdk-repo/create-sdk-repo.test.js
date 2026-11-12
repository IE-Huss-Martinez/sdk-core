import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../../scripts/create-sdk-repo.mjs", import.meta.url));
const FAKE_GH = fileURLToPath(new URL("fake-gh.js", import.meta.url));

/** The GitHub Actions app's ID, which required checks are bound to. */
const ACTIONS = 15368;

/**
 * The family's settings: sdk-core's state as GitHub reported it on
 * 2026-11-12, through the same endpoints the script reads, with secret
 * scanning, push protection and both Dependabot features turned on. The
 * script must find nothing to change in it.
 */
const SDK_CORE = {
  settings: {
    name: "sdk-core",
    description: "Shared runtime, design standards and tooling",
    visibility: "public",
    has_issues: true,
    has_wiki: false,
    has_projects: false,
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false,
    allow_auto_merge: false,
    squash_merge_commit_title: "PR_TITLE",
    squash_merge_commit_message: "BLANK",
    delete_branch_on_merge: true,
    security_and_analysis: {
      secret_scanning: { status: "enabled" },
      secret_scanning_push_protection: { status: "enabled" },
    },
  },
  vulnerabilityReporting: true,
  dependabotAlerts: true,
  dependabotSecurityUpdates: true,
  workflowPermissions: {
    default_workflow_permissions: "read",
    can_approve_pull_request_reviews: false,
  },
  environments: Object.fromEntries(
    ["npm", "release"].map((name, index) => [
      name,
      {
        deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
        branches: [{ id: 100 + index, name: "main", type: "branch" }],
      },
    ]),
  ),
  branches: ["main"],
  files: [
    ".github/workflows/pr-title.yml",
    ".github/workflows/verify.yml",
    ".github/workflows/release.yml",
    ".changeset/config.json",
  ],
  protection: {
    required_status_checks: {
      strict: true,
      contexts: ["pr-title", "verify", "changeset"],
      checks: ["pr-title", "verify", "changeset"].map((context) => ({ context, app_id: ACTIONS })),
    },
    required_pull_request_reviews: {
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      require_last_push_approval: false,
      required_approving_review_count: 0,
    },
    required_signatures: { enabled: false },
    enforce_admins: { enabled: true },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    block_creations: { enabled: false },
    required_conversation_resolution: { enabled: false },
    lock_branch: { enabled: false },
    allow_fork_syncing: { enabled: false },
  },
};

/**
 * A fake GitHub with the given repositories, removed when the test finishes.
 *
 * @param {(fn: () => Promise<void>) => void} onTestFinished
 * @param {Record<string, unknown>} [repos]
 */
async function github(onTestFinished, repos = {}) {
  const root = await mkdtemp(join(tmpdir(), "hm-create-sdk-repo-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  const state = join(root, "state");
  await mkdir(bin);
  await mkdir(state);
  await writeFile(join(bin, "gh"), `#!/bin/sh\nexec node "${FAKE_GH}" "$@"\n`);
  await chmod(join(bin, "gh"), 0o755);
  await writeFile(join(state, "state.json"), JSON.stringify({ repos: structuredClone(repos) }));
  await writeFile(join(state, "calls.ndjson"), "");

  return {
    /** Runs the script with the fake gh first on PATH. @param {string[]} args */
    async run(args) {
      await writeFile(join(state, "calls.ndjson"), "");
      return /** @type {Promise<{ code: number, stdout: string, stderr: string }>} */ (
        new Promise((resolve) => {
          execFile(
            process.execPath,
            [SCRIPT, ...args],
            {
              encoding: "utf8",
              env: { ...process.env, PATH: `${bin}:${process.env["PATH"]}`, FAKE_STATE: state },
            },
            (error, stdout, stderr) => {
              resolve({ code: error ? Number(error.code ?? 1) : 0, stdout, stderr });
            },
          );
        })
      );
    },
    /** The calls the last run made. @returns {Promise<Array<{ method: string, path: string, body?: unknown }>>} */
    async calls() {
      return (await readFile(join(state, "calls.ndjson"), "utf8"))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
    /** A repository's current state. @param {string} name */
    async repo(name) {
      return JSON.parse(await readFile(join(state, "state.json"), "utf8")).repos[name];
    },
    /** Changes a repository's state, as a merged pull request would. */
    async update(name, change) {
      const all = JSON.parse(await readFile(join(state, "state.json"), "utf8"));
      change(all.repos[name]);
      await writeFile(join(state, "state.json"), JSON.stringify(all));
    },
  };
}

/** sdk-core as it is on GitHub today, with the four security features off. */
const SDK_CORE_TODAY = structuredClone(SDK_CORE);
SDK_CORE_TODAY.settings.security_and_analysis = {
  secret_scanning: { status: "disabled" },
  secret_scanning_push_protection: { status: "disabled" },
};
SDK_CORE_TODAY.dependabotAlerts = false;
SDK_CORE_TODAY.dependabotSecurityUpdates = false;

const writes = (calls) => calls.filter((call) => call.method !== "GET");
const checksOf = (repo) => repo.protection?.required_status_checks?.checks ?? null;

describe.concurrent("create-sdk-repo", () => {
  it.for([
    ["no name", []],
    ["uppercase letters", ["Pdf-sdk"]],
    ["no -sdk suffix", ["pdf"]],
    ["an underscore", ["pdf_sdk"]],
    ["digits", ["pdf2-sdk"]],
    ["a path", ["../pdf-sdk"]],
    ["two names", ["pdf-sdk", "image-sdk"]],
    ["an unknown option", ["pdf-sdk", "--force"]],
    ["--description without a value", ["pdf-sdk", "--description"]],
  ])("rejects %s, without calling GitHub", async ([, args], { onTestFinished }) => {
    const gh = await github(onTestFinished);

    const run = await gh.run(args);

    expect(run.code).toBe(2);
    expect(run.stderr).not.toBe("");
    expect(await gh.calls()).toEqual([]);
  });

  it("accepts the shared repositories' names", async ({ onTestFinished }) => {
    const gh = await github(onTestFinished, { "sdk-core": SDK_CORE });

    for (const name of ["sdk-core", "ui"]) {
      expect((await gh.run([name])).code).toBe(0);
    }
  });

  it("only reads in a dry run of a new repository, and lists what it would do", async ({
    onTestFinished,
  }) => {
    const gh = await github(onTestFinished);

    const run = await gh.run(["pdf-sdk", "--description", "PDF tools"]);

    expect(run.code, run.stderr).toBe(0);
    expect(run.stdout).toContain(
      "ie-huss-martinez/pdf-sdk (dry run: nothing is changed without --apply)",
    );
    for (const line of [
      "would change: create the public repository",
      "would change: turn on private vulnerability reporting",
      "would change: turn on secret scanning and push protection",
      "would change: turn on Dependabot alerts",
      "would change: turn on Dependabot security updates",
      "would change: limit the release environment to main",
      "would change: limit the npm environment to main",
      "skipped: main doesn't exist yet",
    ]) {
      expect(run.stdout).toContain(line);
    }
    expect(run.stdout).toMatch(/\d+ changes to make\. Run again with --apply/);
    expect(writes(await gh.calls())).toEqual([]);
    expect(await gh.repo("pdf-sdk")).toBeUndefined();
  });

  it("sets up a new repository with --apply, then finds nothing to change", async ({
    onTestFinished,
  }) => {
    const gh = await github(onTestFinished);

    const run = await gh.run(["pdf-sdk", "--description", "PDF tools", "--apply"]);

    expect(run.code, run.stderr).toBe(0);
    const repo = await gh.repo("pdf-sdk");
    expect(repo.settings).toMatchObject({
      ...SDK_CORE.settings,
      name: "pdf-sdk",
      description: "PDF tools",
    });
    expect(repo.vulnerabilityReporting).toBe(true);
    expect(repo.settings.security_and_analysis).toEqual(SDK_CORE.settings.security_and_analysis);
    expect(repo.dependabotAlerts).toBe(true);
    expect(repo.dependabotSecurityUpdates).toBe(true);
    expect(repo.workflowPermissions).toEqual(SDK_CORE.workflowPermissions);
    for (const name of ["release", "npm"]) {
      expect(repo.environments[name].deployment_branch_policy).toEqual({
        protected_branches: false,
        custom_branch_policies: true,
      });
      expect(repo.environments[name].branches.map(({ name, type }) => ({ name, type }))).toEqual([
        { name: "main", type: "branch" },
      ]);
    }
    // No main yet, so no protection, and never any secret.
    expect(repo.protection).toBeNull();
    expect((await gh.calls()).some((call) => call.path.includes("secrets"))).toBe(false);
    expect(run.stdout).toContain(
      "Configure its trusted publisher: organisation ie-huss-martinez, repository pdf-sdk, workflow release.yml, environment npm.",
    );

    const again = await gh.run(["pdf-sdk", "--description", "PDF tools", "--apply"]);

    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toContain("Nothing to change.");
    expect(writes(await gh.calls())).toEqual([]);
  });

  it("requires each check once its workflow is on main", async ({ onTestFinished }) => {
    const gh = await github(onTestFinished);
    await gh.run(["pdf-sdk", "--apply"]);
    /** Merges files to main, re-runs the script, and returns the required checks. */
    const merge = async (...files) => {
      await gh.update("pdf-sdk", (repo) => {
        repo.branches = ["main"];
        repo.files.push(...files);
      });
      const run = await gh.run(["pdf-sdk", "--apply"]);
      expect(run.code, run.stderr).toBe(0);
      return checksOf(await gh.repo("pdf-sdk"))?.map((check) => check.context) ?? [];
    };

    await expect(merge("README.md")).resolves.toEqual([]);
    await expect(merge(".github/workflows/pr-title.yml")).resolves.toEqual(["pr-title"]);
    await expect(merge(".github/workflows/verify.yml")).resolves.toEqual(["pr-title", "verify"]);
    // The changeset check needs both its workflow and the Changesets config.
    await expect(merge(".github/workflows/release.yml")).resolves.toEqual(["pr-title", "verify"]);
    await expect(merge(".changeset/config.json")).resolves.toEqual([
      "pr-title",
      "verify",
      "changeset",
    ]);

    const { protection } = await gh.repo("pdf-sdk");
    expect(protection).toEqual(SDK_CORE.protection);

    const again = await gh.run(["pdf-sdk", "--apply"]);
    expect(again.stdout).toContain(
      "ok: main is protected, with required checks: pr-title, verify, changeset",
    );
    expect(writes(await gh.calls())).toEqual([]);
  }, 60_000);

  it("finds nothing to change in sdk-core's actual settings", async ({ onTestFinished }) => {
    const gh = await github(onTestFinished, { "sdk-core": SDK_CORE });

    const run = await gh.run(["sdk-core", "--apply"]);

    expect(run.code, run.stderr).toBe(0);
    expect(run.stdout).toContain("Nothing to change.");
    expect(writes(await gh.calls())).toEqual([]);
  });

  it("turns on only the security features in sdk-core as it is today", async ({
    onTestFinished,
  }) => {
    const gh = await github(onTestFinished, { "sdk-core": SDK_CORE_TODAY });

    const dry = await gh.run(["sdk-core"]);

    expect(dry.code, dry.stderr).toBe(0);
    expect(dry.stdout.split("\n").filter((line) => line.includes("would change"))).toEqual([
      "  would change: turn on secret scanning and push protection",
      "  would change: turn on Dependabot alerts",
      "  would change: turn on Dependabot security updates",
    ]);
    expect(writes(await gh.calls())).toEqual([]);

    const applied = await gh.run(["sdk-core", "--apply"]);

    expect(applied.code, applied.stderr).toBe(0);
    // Security updates need the alerts first, which the fake enforces too.
    expect(writes(await gh.calls()).map((call) => `${call.method} ${call.path}`)).toEqual([
      "PATCH repos/ie-huss-martinez/sdk-core",
      "PUT repos/ie-huss-martinez/sdk-core/vulnerability-alerts",
      "PUT repos/ie-huss-martinez/sdk-core/automated-security-fixes",
    ]);
    expect(await gh.repo("sdk-core")).toEqual(SDK_CORE);
  });

  it("lists drift in a dry run without changing it, and repairs it with --apply", async ({
    onTestFinished,
  }) => {
    const drifted = structuredClone(SDK_CORE);
    drifted.settings.allow_merge_commit = true;
    drifted.vulnerabilityReporting = false;
    drifted.settings.security_and_analysis.secret_scanning_push_protection = { status: "disabled" };
    drifted.environments.npm.branches.push({ id: 200, name: "develop", type: "branch" });
    drifted.protection.allow_force_pushes = { enabled: true };
    drifted.protection.required_status_checks.checks.push({ context: "extra", app_id: 1 });
    const gh = await github(onTestFinished, { "sdk-core": drifted });

    const dry = await gh.run(["sdk-core"]);

    expect(dry.code, dry.stderr).toBe(0);
    for (const line of [
      "would change: set allow_merge_commit",
      "would change: turn on private vulnerability reporting",
      "would change: turn on secret scanning and push protection",
      "would change: remove develop from the npm environment's branches",
      "would change: update main's protection (required_status_checks, allow_force_pushes)",
    ]) {
      expect(dry.stdout).toContain(line);
    }
    expect(writes(await gh.calls())).toEqual([]);
    expect(await gh.repo("sdk-core")).toEqual(drifted);

    const applied = await gh.run(["sdk-core", "--apply"]);

    expect(applied.code, applied.stderr).toBe(0);
    const repo = await gh.repo("sdk-core");
    expect(repo.settings).toEqual(SDK_CORE.settings);
    expect(repo.settings.security_and_analysis).toEqual(SDK_CORE.settings.security_and_analysis);
    expect(repo.vulnerabilityReporting).toBe(true);
    expect(repo.environments.npm.branches.map((branch) => branch.name)).toEqual(["main"]);
    expect(repo.protection).toEqual(SDK_CORE.protection);
    expect((await gh.run(["sdk-core"])).stdout).toContain("Nothing to change.");
  });
});
