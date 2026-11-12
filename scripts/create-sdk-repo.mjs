#!/usr/bin/env node
// Sets up a repository of the SDK family in the ie-huss-martinez organisation
// with the family's settings, so a new SDK needs no manual GitHub steps
// (ADR 0024).
//
// Usage:
//   node scripts/create-sdk-repo.mjs <name> [--description <text>] [--apply]
//
// It reads the repository's current state, prints what it would change, and
// changes nothing without --apply. Running it again is safe: it only changes
// what differs. It uses the `gh` CLI, with the `repo` scope.
//
// What it sets, copied from sdk-core's and ui's settings:
// - the repository, created as public if it's missing;
// - squash merging only, with the pull request title and a blank message,
//   branches deleted on merge, and no wiki or projects;
// - private vulnerability reporting, secret scanning with push protection,
//   Dependabot alerts and Dependabot security updates;
// - a read-only GITHUB_TOKEN by default, which can't approve pull requests;
// - the `release` and `npm` environments, limited to `main`, with no secrets:
//   the release App and its credentials are organisation-level. Repositories
//   that publish nothing to npm, such as sdk-ci, get neither;
// - protection for `main` once it exists: pull requests with no required
//   approvals, admins included, linear history, no force pushes or deletions,
//   and up-to-date required checks. Each check is required once its workflow
//   is on `main`: `pr-title` with pr-title.yml, `verify` with verify.yml, and
//   `changeset` with release.yml and .changeset/. Run it again after each
//   setup pull request to require the next.
//
// The repository's contents come from pull requests, not from this script.

import { execFileSync } from "node:child_process";

const ORG = "ie-huss-martinez";
/**
 * Shared repositories, whose names don't follow `<kind>-sdk`, and whether
 * each publishes npm packages. Every `<kind>-sdk` repository does.
 */
const SHARED = new Map([
  ["sdk-core", { publishes: true }],
  ["ui", { publishes: true }],
  // GitHub Actions, released as tags (ADR 0026).
  ["sdk-ci", { publishes: false }],
]);
const NAME = /^[a-z]+-sdk$/;
/** The GitHub Actions app: required checks only accept its results. */
const GITHUB_ACTIONS_APP_ID = 15368;

const print = (text = "") => process.stdout.write(`${text}\n`);
const fail = (text) => {
  process.stderr.write(`${text}\n`);
  process.exit(2);
};

const USAGE = "Usage: node scripts/create-sdk-repo.mjs <name> [--description <text>] [--apply]";

/** @returns {{ name: string, description?: string, apply: boolean }} */
function parseArguments(args) {
  /** @type {{ name?: string, description?: string, apply: boolean }} */
  const options = { apply: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--description") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) {
        fail(`--description needs a value.\n${USAGE}`);
      }
      options.description = value;
      index += 1;
    } else if (arg?.startsWith("--")) {
      fail(`Unknown option ${arg}.\n${USAGE}`);
    } else if (options.name === undefined) {
      options.name = arg;
    } else {
      fail(`Unexpected argument ${arg}.\n${USAGE}`);
    }
  }
  if (!options.name) {
    fail(USAGE);
  }
  if (!NAME.test(options.name) && !SHARED.has(options.name)) {
    fail(
      `"${options.name}" isn't a valid repository name: use <kind>-sdk in lowercase letters, such as pdf-sdk, or one of the shared repositories (${[...SHARED.keys()].join(", ")}).`,
    );
  }
  return /** @type {{ name: string, description?: string, apply: boolean }} */ (options);
}

class NotFound extends Error {}

/**
 * Calls the GitHub API through `gh api`. Returns the parsed response, or
 * throws NotFound for a 404.
 *
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 */
function api(method, path, body) {
  const args = ["api", "--method", method, path];
  if (body !== undefined) {
    args.push("--input", "-");
  }
  try {
    const output = execFileSync("gh", args, {
      encoding: "utf8",
      input: body === undefined ? "" : JSON.stringify(body),
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output.trim() ? JSON.parse(output) : undefined;
  } catch (error) {
    const stderr = String(/** @type {{ stderr?: unknown }} */ (error).stderr ?? "");
    if (/HTTP 404/.test(stderr)) {
      throw new NotFound(path);
    }
    throw new Error(`gh api --method ${method} ${path} failed: ${stderr.trim() || error}`);
  }
}

/** Like api("GET", …), but returns undefined for a 404. */
function get(path) {
  try {
    return api("GET", path);
  } catch (error) {
    if (error instanceof NotFound) {
      return undefined;
    }
    throw error;
  }
}

const { name, description, apply } = parseArguments(process.argv.slice(2));
const repo = `repos/${ORG}/${name}`;
/** Whether the repository publishes npm packages, and so releases. */
const publishes = SHARED.get(name)?.publishes ?? true;

/** @type {Array<{ summary: string, run: () => void }>} */
const changes = [];
/** Records a change, and makes it at once with --apply. */
function change(summary, run) {
  changes.push({ summary, run });
  print(`  ${apply ? "changing" : "would change"}: ${summary}`);
  if (apply) {
    run();
  }
}
const ok = (summary) => print(`  ok: ${summary}`);

/** Lists the fields of `current` that differ from `desired`. */
function differences(current, desired) {
  return Object.entries(desired)
    .filter(([key, value]) => JSON.stringify(current?.[key]) !== JSON.stringify(value))
    .map(([key]) => key);
}

print(`${ORG}/${name}${apply ? "" : " (dry run: nothing is changed without --apply)"}`);

// The repository.
let current = get(repo);
const exists = current !== undefined;
if (exists) {
  ok("the repository exists");
} else {
  change("create the public repository", () => {
    current = api("POST", `orgs/${ORG}/repos`, {
      name,
      ...(description === undefined ? {} : { description }),
      visibility: "public",
      auto_init: false,
    });
  });
}

// General settings.
const settings = {
  ...(description === undefined ? {} : { description }),
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
};
const changed = current ? differences(current, settings) : Object.keys(settings);
if (changed.length === 0) {
  ok("squash merging only, branches deleted on merge, no wiki or projects");
} else {
  const patch = Object.fromEntries(changed.map((key) => [key, settings[key]]));
  change(`set ${changed.join(", ")}`, () => api("PATCH", repo, patch));
}

// When the repository doesn't exist yet in a dry run, everything else is new.
const live = exists || apply;

// Private vulnerability reporting.
if (live && get(`${repo}/private-vulnerability-reporting`)?.enabled === true) {
  ok("private vulnerability reporting is on");
} else {
  change("turn on private vulnerability reporting", () =>
    api("PUT", `${repo}/private-vulnerability-reporting`),
  );
}

// Secret scanning, and push protection, which rejects a push that contains a
// known kind of credential.
const scanning = ["secret_scanning", "secret_scanning_push_protection"];
const analysis = current?.security_and_analysis;
if (live && scanning.every((feature) => analysis?.[feature]?.status === "enabled")) {
  ok("secret scanning and push protection are on");
} else {
  change("turn on secret scanning and push protection", () =>
    api("PATCH", repo, {
      security_and_analysis: Object.fromEntries(
        scanning.map((feature) => [feature, { status: "enabled" }]),
      ),
    }),
  );
}

// Dependabot alerts. GitHub answers 204 with no body when they're on, and
// 404 when they're off.
let alerts = false;
if (live) {
  try {
    api("GET", `${repo}/vulnerability-alerts`);
    alerts = true;
  } catch (error) {
    if (!(error instanceof NotFound)) {
      throw error;
    }
  }
}
if (alerts) {
  ok("Dependabot alerts are on");
} else {
  change("turn on Dependabot alerts", () => api("PUT", `${repo}/vulnerability-alerts`));
}

// Dependabot security updates, which need the alerts above.
if (live && get(`${repo}/automated-security-fixes`)?.enabled === true) {
  ok("Dependabot security updates are on");
} else {
  change("turn on Dependabot security updates", () =>
    api("PUT", `${repo}/automated-security-fixes`),
  );
}

// The default GITHUB_TOKEN permissions.
const workflowPermissions = {
  default_workflow_permissions: "read",
  can_approve_pull_request_reviews: false,
};
const permissions = live ? get(`${repo}/actions/permissions/workflow`) : undefined;
if (permissions && differences(permissions, workflowPermissions).length === 0) {
  ok("GITHUB_TOKEN is read-only by default and can't approve pull requests");
} else {
  change("make GITHUB_TOKEN read-only by default, unable to approve pull requests", () =>
    api("PUT", `${repo}/actions/permissions/workflow`, workflowPermissions),
  );
}

// The release and npm environments, limited to main, without secrets. A
// repository that publishes nothing to npm gets neither.
if (!publishes) {
  print(`  skipped: ${name} publishes no npm packages, so it gets no release or npm environment.`);
}
for (const environment of publishes ? ["release", "npm"] : []) {
  const path = `${repo}/environments/${environment}`;
  const found = live ? get(path) : undefined;
  const policy = found?.deployment_branch_policy;
  if (!policy?.custom_branch_policies || policy.protected_branches) {
    change(
      found
        ? `restrict the ${environment} environment to selected branches`
        : `create the ${environment} environment`,
      () =>
        api("PUT", path, {
          deployment_branch_policy: { protected_branches: false, custom_branch_policies: true },
        }),
    );
  }
  const branches = found ? (get(`${path}/deployment-branch-policies`)?.branch_policies ?? []) : [];
  for (const branch of branches) {
    if (branch.name !== "main" || (branch.type ?? "branch") !== "branch") {
      change(`remove ${branch.name} from the ${environment} environment's branches`, () =>
        api("DELETE", `${path}/deployment-branch-policies/${branch.id}`),
      );
    }
  }
  if (branches.some((branch) => branch.name === "main" && (branch.type ?? "branch") === "branch")) {
    ok(`the ${environment} environment is limited to main`);
  } else {
    change(`limit the ${environment} environment to main`, () =>
      api("POST", `${path}/deployment-branch-policies`, { name: "main", type: "branch" }),
    );
  }
}

// Protection for main, once the branch exists.
if (!live || !get(`${repo}/branches/main`)) {
  print(
    "  skipped: main doesn't exist yet, so it isn't protected. Run this again after the first commit.",
  );
} else {
  /** Whether a file or directory exists on main. */
  const onMain = (file) => get(`${repo}/contents/${file}?ref=main`) !== undefined;
  const checks = [];
  if (onMain(".github/workflows/pr-title.yml")) {
    checks.push("pr-title");
  }
  if (onMain(".github/workflows/verify.yml")) {
    checks.push("verify");
  }
  if (onMain(".github/workflows/release.yml") && onMain(".changeset")) {
    checks.push("changeset");
  }

  const desired = {
    required_status_checks:
      checks.length === 0
        ? null
        : {
            strict: true,
            checks: checks.map((context) => ({ context, app_id: GITHUB_ACTIONS_APP_ID })),
          },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      required_approving_review_count: 0,
      require_last_push_approval: false,
    },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    block_creations: false,
    required_conversation_resolution: false,
    lock_branch: false,
    allow_fork_syncing: false,
  };

  // The current protection, in the same shape as the desired one.
  const protection = get(`${repo}/branches/main/protection`);
  const reviews = protection?.required_pull_request_reviews;
  const status = protection?.required_status_checks;
  const actual = protection && {
    required_status_checks: status
      ? {
          strict: status.strict,
          checks: (status.checks ?? []).map(({ context, app_id }) => ({ context, app_id })),
        }
      : null,
    enforce_admins: protection.enforce_admins?.enabled,
    required_pull_request_reviews: reviews && {
      dismiss_stale_reviews: reviews.dismiss_stale_reviews,
      require_code_owner_reviews: reviews.require_code_owner_reviews,
      required_approving_review_count: reviews.required_approving_review_count,
      require_last_push_approval: reviews.require_last_push_approval,
    },
    restrictions: protection.restrictions ?? null,
    required_linear_history: protection.required_linear_history?.enabled,
    allow_force_pushes: protection.allow_force_pushes?.enabled,
    allow_deletions: protection.allow_deletions?.enabled,
    block_creations: protection.block_creations?.enabled,
    required_conversation_resolution: protection.required_conversation_resolution?.enabled,
    lock_branch: protection.lock_branch?.enabled,
    allow_fork_syncing: protection.allow_fork_syncing?.enabled,
  };

  const required =
    checks.length === 0 ? "no required checks yet" : `required checks: ${checks.join(", ")}`;
  const off = protection ? differences(actual, desired) : [];
  if (protection && off.length === 0) {
    ok(`main is protected, with ${required}`);
  } else {
    change(
      protection
        ? `update main's protection (${off.join(", ")}), with ${required}`
        : `protect main, with ${required}`,
      () => api("PUT", `${repo}/branches/main/protection`, desired),
    );
  }
}

print();
if (changes.length === 0) {
  print("Nothing to change.");
} else if (apply) {
  print(`Made ${changes.length} change${changes.length === 1 ? "" : "s"}.`);
} else {
  print(
    `${changes.length} change${changes.length === 1 ? "" : "s"} to make. Run again with --apply to make ${changes.length === 1 ? "it" : "them"}.`,
  );
}
if (publishes) {
  print();
  print('Still manual, on npm (CONTRIBUTING.md, "Setting up releases"), for each new package:');
  print(
    "  1. Publish the first version with a short-lived bootstrap token, NPM_TOKEN in the npm environment.",
  );
  print(
    `  2. Configure its trusted publisher: organisation ${ORG}, repository ${name}, workflow release.yml, environment npm.`,
  );
  print("  3. Delete the token, and require two-factor authentication with tokens disallowed.");
}
