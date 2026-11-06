import { fileURLToPath } from "node:url";

/**
 * Commit types accepted in this family. The `pr-title` workflow
 * (`.github/workflows/pr-title.yml`) must list the same types, because the
 * pull request title becomes the squash commit on `main` (ADR 0016).
 */
export const TYPES = [
  "feat",
  "fix",
  "docs",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
];

/**
 * The subject must not start with a capital letter. This is the same pattern
 * as `subjectPattern` in the `pr-title` workflow.
 */
export const SUBJECT_PATTERN = /^(?![A-Z]).+$/;

/**
 * Longest commit header, git's conventional limit for a subject line.
 */
export const HEADER_MAX_LENGTH = 72;

/**
 * Longest pull request title. The squash commit title is the pull request
 * title plus " (#NNN)", which must still fit in {@link HEADER_MAX_LENGTH}.
 * The `pr-title` workflow checks the same number.
 */
export const PR_TITLE_MAX_LENGTH = HEADER_MAX_LENGTH - " (#NNN)".length;

/** @type {import("@commitlint/types").Rule} */
const subjectPattern = ({ subject }) => [
  subject == null || SUBJECT_PATTERN.test(subject),
  "subject must start with a lowercase letter",
];

/**
 * commitlint preset for the `commit-msg` hook (ADR 0016): Conventional
 * Commits, with the types and subject rule of the `pr-title` check, so a
 * message that passes locally also passes as a pull request title.
 *
 * @type {import("@commitlint/types").UserConfig}
 */
const config = {
  // Resolved from this preset, so consumers don't install it themselves.
  extends: [fileURLToPath(import.meta.resolve("@commitlint/config-conventional"))],
  plugins: [{ rules: { "hm/subject-pattern": subjectPattern } }],
  rules: {
    "type-enum": [2, "always", TYPES],
    "header-max-length": [2, "always", HEADER_MAX_LENGTH],
    // Replaced by hm/subject-pattern, which matches the pr-title check exactly.
    "subject-case": [0],
    "hm/subject-pattern": [2, "always"],
  },
};

export default config;
