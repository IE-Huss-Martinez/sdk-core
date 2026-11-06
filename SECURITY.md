# Security policy

The `@hussmartinez` SDKs open files from anywhere and promise that those files never leave the user's device. Vulnerabilities that break that promise, or that let a crafted file affect the page, are the most important reports this project can receive. Thank you for taking the time to report one privately.

## Reporting a vulnerability

**Please don't open a public issue, pull request or discussion.**

Report it through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**, or go directly to [the advisory form](https://github.com/hussmartinez/sdk-core/security/advisories/new). Only the maintainer can see the report.

Please include:

- the affected package and version, or the commit;
- what an attacker can do, and under which conditions;
- steps to reproduce it, or a proof of concept;
- if a file triggers it, a file made for the purpose. Don't send files containing personal or confidential data.

## What to expect

- **Acknowledgement** within 7 days.
- **Updates** at least every 14 days until the issue is resolved.
- **A fix and an advisory.** Once a fix is released, a GitHub Security Advisory describes the issue, with a CVE where it applies. You're credited in the advisory unless you'd rather not be.
- **Coordinated disclosure.** Please keep the issue private until the advisory is published, or for 90 days after your report, whichever comes first. If a fix needs longer, we'll agree on a date with you.

## Supported versions

The packages are pre-1.0. Security fixes go into the latest release of each package only. No package has been published yet.

## Scope

In scope is everything in this repository: `@hussmartinez/sdk-core`, `@hussmartinez/sdk-config`, the workflows that verify and release them, and the published packages. Examples:

- a crafted file or message that runs code, escapes a worker or freezes the page ([ADR 0012](docs/adr/0012-hostile-input-and-no-network.md));
- any network request the SDKs make without the host asking for it;
- resource limits that can be bypassed;
- weaknesses in the build, release or publishing workflows, such as unpinned actions or excessive permissions ([ADR 0015](docs/adr/0015-verification-and-releases.md)).

Out of scope:

- vulnerabilities in a dependency that are already public. Report those upstream, but do tell us if the way we use the dependency makes it exploitable;
- issues that need an already compromised device, browser or build environment.

Each SDK repository in the family has its own `SECURITY.md` and handles reports for its own code.
