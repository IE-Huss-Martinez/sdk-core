// A fake `gh` for the create-sdk-repo tests. It serves `gh api --method …`
// calls from $FAKE_STATE/state.json, in the shapes GitHub's REST API uses,
// applies writes to it, and logs every call to $FAKE_STATE/calls.ndjson.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.FAKE_STATE ?? "";
const file = join(dir, "state.json");
const state = JSON.parse(readFileSync(file, "utf8"));
const args = process.argv.slice(2);
const method = args[args.indexOf("--method") + 1] ?? "GET";
const path = args[args.indexOf("--method") + 2] ?? "";
const body = args.includes("--input") ? JSON.parse(readFileSync(0, "utf8") || "null") : undefined;
appendFileSync(join(dir, "calls.ndjson"), `${JSON.stringify({ method, path, body })}\n`);

const save = () => writeFileSync(file, JSON.stringify(state, null, 2));
const respond = (value) => process.stdout.write(value === undefined ? "" : JSON.stringify(value));
const notFound = () => {
  process.stderr.write("gh: Not Found (HTTP 404)\n");
  process.exit(1);
};

if (args[0] !== "api" || !args.includes("--method")) {
  process.stderr.write(`fake gh: unsupported call: ${args.join(" ")}\n`);
  process.exit(2);
}

const [route, query = ""] = path.split("?");
const parts = route.split("/");

/** GitHub's defaults for a new organisation repository. */
function newRepository(name, input) {
  return {
    settings: {
      name,
      description: input.description ?? null,
      visibility: input.visibility ?? "public",
      has_issues: true,
      has_wiki: true,
      has_projects: true,
      allow_squash_merge: true,
      allow_merge_commit: true,
      allow_rebase_merge: true,
      allow_auto_merge: false,
      squash_merge_commit_title: "COMMIT_OR_PR_TITLE",
      squash_merge_commit_message: "COMMIT_MESSAGES",
      delete_branch_on_merge: false,
    },
    vulnerabilityReporting: false,
    workflowPermissions: {
      default_workflow_permissions: "write",
      can_approve_pull_request_reviews: false,
    },
    environments: {},
    branches: [],
    files: [],
    protection: null,
  };
}

/** Stores a protection PUT body the way GitHub returns it on GET. */
function storedProtection(input) {
  const enabled = (value) => ({ enabled: Boolean(value) });
  const checks = input.required_status_checks;
  return {
    required_status_checks: checks && {
      strict: checks.strict,
      contexts: checks.checks.map((check) => check.context),
      checks: checks.checks,
    },
    required_pull_request_reviews: input.required_pull_request_reviews,
    required_signatures: { enabled: false },
    enforce_admins: enabled(input.enforce_admins),
    required_linear_history: enabled(input.required_linear_history),
    allow_force_pushes: enabled(input.allow_force_pushes),
    allow_deletions: enabled(input.allow_deletions),
    block_creations: enabled(input.block_creations),
    required_conversation_resolution: enabled(input.required_conversation_resolution),
    lock_branch: enabled(input.lock_branch),
    allow_fork_syncing: enabled(input.allow_fork_syncing),
    ...(input.restrictions ? { restrictions: input.restrictions } : {}),
  };
}

if (method === "POST" && parts[0] === "orgs" && parts[2] === "repos") {
  if (state.repos[body.name]) {
    process.stderr.write("gh: name already exists on this account (HTTP 422)\n");
    process.exit(1);
  }
  state.repos[body.name] = newRepository(body.name, body);
  save();
  respond(state.repos[body.name].settings);
  process.exit(0);
}

if (parts[0] !== "repos") {
  notFound();
}
const repo = state.repos[parts[2]];
if (!repo) {
  notFound();
}
const rest = parts.slice(3).join("/");

if (rest === "") {
  if (method === "GET") {
    respond(repo.settings);
  } else if (method === "PATCH") {
    Object.assign(repo.settings, body);
    save();
    respond(repo.settings);
  }
} else if (rest === "private-vulnerability-reporting") {
  if (method === "GET") {
    respond({ enabled: repo.vulnerabilityReporting });
  } else {
    repo.vulnerabilityReporting = method === "PUT";
    save();
  }
} else if (rest === "actions/permissions/workflow") {
  if (method === "GET") {
    respond(repo.workflowPermissions);
  } else {
    repo.workflowPermissions = { ...repo.workflowPermissions, ...body };
    save();
  }
} else if (parts[3] === "environments") {
  const name = parts[4];
  const environment = repo.environments[name];
  const policies = parts[5] === "deployment-branch-policies";
  if (!policies) {
    if (method === "GET") {
      if (!environment) {
        notFound();
      }
      respond({ name, deployment_branch_policy: environment.deployment_branch_policy });
    } else if (method === "PUT") {
      repo.environments[name] = {
        branches: environment?.branches ?? [],
        deployment_branch_policy: body.deployment_branch_policy,
      };
      save();
      respond({ name });
    }
  } else {
    if (!environment) {
      notFound();
    }
    if (method === "GET") {
      respond({ total_count: environment.branches.length, branch_policies: environment.branches });
    } else if (method === "POST") {
      state.nextId = (state.nextId ?? 1) + 1;
      environment.branches.push({ id: state.nextId, name: body.name, type: body.type });
      save();
      respond(environment.branches.at(-1));
    } else if (method === "DELETE") {
      environment.branches = environment.branches.filter(
        (branch) => String(branch.id) !== parts[6],
      );
      save();
    }
  }
} else if (rest === "branches/main") {
  if (!repo.branches.includes("main")) {
    notFound();
  }
  respond({ name: "main" });
} else if (rest === "branches/main/protection") {
  if (method === "GET") {
    if (!repo.protection) {
      notFound();
    }
    respond(repo.protection);
  } else if (method === "PUT") {
    repo.protection = storedProtection(body);
    save();
    respond(repo.protection);
  }
} else if (parts[3] === "contents") {
  const wanted = parts.slice(4).join("/");
  const onMain =
    query === "ref=main" &&
    repo.branches.includes("main") &&
    repo.files.some((path) => path === wanted || path.startsWith(`${wanted}/`));
  if (!onMain) {
    notFound();
  }
  respond({ path: wanted });
} else {
  process.stderr.write(`fake gh: unsupported endpoint ${method} ${path}\n`);
  process.exit(2);
}
