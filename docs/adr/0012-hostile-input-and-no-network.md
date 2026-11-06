# 0012. Treat every input file as hostile, and make no network requests

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The SDKs open files from anywhere: email attachments, downloads, user uploads. Media parsers are a classic attack surface:

- **Code execution:** pdf.js before 4.2.67 allowed arbitrary JavaScript execution through a crafted font (CVE-2024-4367).
- **Scripts in images:** SVG files can contain scripts.
- **Decompression bombs:** compressed streams can expand to gigabytes.
- **Untrusted text:** file names and metadata are attacker-controlled strings.

The family's promise is that files never leave the user's device, so any network request is a privacy defect as well as a supply-chain risk.

## Decision

### Input handling

- **Parse only in workers.** Untrusted bytes are parsed off the main thread, in a worker that can be terminated.
- **Resource limits:** every SDK enforces limits on file size, page or frame count, pixel count, decoded size and processing time. Exceeding one fails with a specific error code. Limits are configurable through `filePolicy`, with safe defaults.
- **Hardened parsers:** dependencies run with risky features off. For pdf.js, that means:
  - `isEvalSupported: false`;
  - scripting disabled;
  - links limited to `http`, `https` and `mailto`;
  - every link opened with `rel="noopener noreferrer"`.
- **No raw HTML from files:** file names, metadata and other file-derived strings are rendered as text, never with `innerHTML`. SVG input is sanitised, or displayed only through `<img>`, which doesn't run scripts.

### Network

- **No network requests by default:** no remote fonts, no CDN scripts, no telemetry. Analytics only happen through the host's `onEvent` callback, and events never contain file names or contents.
- **Enforced by tests:** every end-to-end suite fails if the page makes a request to any origin other than the test server.

### Supply chain

- **Minimal dependencies.** Each new runtime dependency needs a justification in its pull request.
- **Locked builds:** lockfiles are committed, dependency install scripts are blocked except for an explicit allowlist, and licences are checked for compatibility with Apache-2.0.
- **Pinned GitHub Actions:** actions are pinned to a full commit SHA.
- **Trusted publishing:** packages are published from GitHub Actions with npm provenance ([0015](0015-local-verification-and-releases.md)).
- **Disclosure:** `SECURITY.md` describes private vulnerability reporting.

## Alternatives considered

- **Trusting the parser libraries' defaults:** defaults favour features over safety, as CVE-2024-4367 showed.
- **Parsing on the main thread for simplicity:** a malicious or huge file would freeze or crash the host page, with no way to stop it.

## Consequences

- Opening a file can never run attacker code in the page, freeze the page, or leak data over the network.
- Some PDF features, such as embedded JavaScript and XFA forms, are deliberately unsupported.
- Limits occasionally reject legitimate large files. The error explains which limit applied, and hosts can raise it.
