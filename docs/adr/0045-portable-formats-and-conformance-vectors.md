# 0045. Portable formats and language-neutral conformance vectors

- **Status:** Accepted
- **Date:** 2026-11-13
- **Amended:** 2026-11-13, with the conventions from the first adoption ([audio-sdk#34](https://github.com/ie-huss-martinez/audio-sdk/pull/34)): shared rejection codes for documents, strict readers, and publishing the schemas

## Context

The SDKs may one day have ports in other languages, such as a desktop PDF editor written in Rust. Code won't be shared across languages, but documents and behaviour must be: a document saved in the browser editor must open in the desktop app, and a port must be shown to behave like the TypeScript SDK, not just believed to.

Today nothing makes that possible. Measured on each SDK's `main`:

| SDK | Format name and version on persisted data | JSON Schemas | Property tests in the core | Example tests in `core/operations` | Invalid commands rejected with |
|---|---|---|---|---|---|
| `pdf-sdk` | none | none | 0 | 14 | untyped `TypeError` and `RangeError`, message text only |
| `audio-sdk` | none | none | 1 | 15 | `INVALID_COMMAND`, the rule in the message only |
| `image-sdk` | none | none | 5 | 10 | `INVALID_COMMAND`, the rule in the message only |
| `video-sdk` | none | none | 5 | 15 | `INVALID_COMMAND`, the rule in the message only |

Several models hold values JSON can't carry as they are: `pdf-sdk`'s signature images are `Uint8Array`s inside the plan, and its positions are fractions of the page. Sources are named by ids, such as `s1`, that only mean something within one session. `ai-core` hashes JSON (its `CONTEXT_CHANGED` fingerprint), which other languages would have to reproduce byte for byte, and its wire protocols are byte streams, not only JSON.

## Decision

### 1. Every persisted or exchanged format is versioned, documented JSON

- **What's covered:** a document's plan and the user-level edit commands, content an SDK saves or exchanges, and wire protocols. Undo history's inverse commands, such as `pdf.restorePages`, which carry whole pages, are internal and aren't a portable format.
- **Each document names its format and version:** `{ "format": "hm-pdf-plan", "version": 1, … }`. Format names are `hm-<kind>-<thing>`. Versions are integers.
- **A JSON Schema per format version,** draft 2020-12, at `formats/<format>/v<N>.schema.json` in the SDK's repository, with a short record of the format in its `docs/`.
- **The schema describes the JSON form, not the in-memory form.** Where they differ, the SDK converts at the edge, such as bytes in memory and an asset reference in JSON.
- **Breaking changes bump the version,** and ship a migration from the previous version, so every earlier version stays readable. A document with an unknown, later version is refused with the SDK's error code for an unsupported format, never misread.

### 2. Binary data is a content-addressed asset

- **A format never inlines binary data.** A binary value is a reference: `{ "asset": "sha256:<hex>", "mediaType": "image/png", "size": 12345 }`. Equal bytes share one asset, and documents stay small.
- **Sources are assets too.** A document's manifest maps each session id, such as `s1`, to its content: the SHA-256 of its bytes, its media type and its size. It records a file name only if the user opts in, because names reveal more than content hashes ([ADR 0012](0012-hostile-input-and-no-network.md)).
- **How assets travel with a document,** for example a container file, is decided by a later record, when the first SDK saves and opens documents.

### 3. Numbers are exact, or the tolerance is stated

- **Integers wherever the models already use them:** microseconds, samples, frames and pixels. Video frame rates stay exact fractions, `{ "num": 30000, "den": 1001 }`.
- **Fractional positions use a fixed integer grid** that the format states, such as millionths of a page for `pdf-sdk`'s positions. The SDK converts at the edge, so a port reproduces each position exactly.
- **Floats that are only validated and copied,** such as `audio-sdk`'s `gainDb`, stay floats. They round-trip exactly: JSON numbers parse to the nearest double in every mainstream language, and JavaScript, Rust, Python and Go print doubles in their shortest round-trip form. So the vectors compare them exactly. A port in a language without a shortest-form printer, such as Java before 19, must use one.
- **Computed floats,** such as gains from decibels, fade curves and pixel values, differ between languages in their last bits, because `pow` and `sin` do. Vectors that check them state a `tolerance`.

### 4. Anything hashed across languages is canonical JSON

Values that are hashed or compared as bytes across languages, such as `ai-core`'s fingerprint of `system` and `tools`, are serialised with **JSON Canonicalization Scheme ([RFC 8785](https://www.rfc-editor.org/rfc/rfc8785))**, which fixes key order, number formatting and string escaping. Never "whatever `JSON.stringify` produces".

Opaque fields, such as a model provider's state, hold any JSON and are passed through unchanged, never interpreted or reshaped. When they must be replayed byte-exact, they're carried as a JSON string.

### 5. Conformance vectors: language-neutral tests of the deterministic logic

- **Each SDK keeps `conformance/`:** JSON files of cases for its pure, deterministic logic.
  - **Commands:** a command applied to a plan gives the expected plan, and applying its inverse restores the original plan. The inverse's own shape isn't fixed, because inverses are internal.
  - **Validation:** a plan or command is accepted, or rejected with an expected error code and reason.
  - **Limits, geometry and grading:** checked against the expected results.
  - **Wire protocols:** at the framing level as well as the payloads. For example, server-sent events cover CRLF line endings, a CR at the end of a chunk, a multi-byte character split between chunks, and an unfinished final event. Chunks are base64, so any split can be expressed.
- **A case is `{ "name", "input", …, "expected" }`,** with a `tolerance` where section 3 calls for one, in a file that names its subject and version: `{ "format": "hm-conformance", "version": 1, "subject": "hm-video-commands", "cases": [ … ] }`.
- **Rejections compare codes and reasons, never messages.** An expected rejection is `{ "error": { "code": "INVALID_COMMAND", "reason": "clip-too-short" } }`. So every rejection a vector can reach carries a stable `details.reason` token beside its code, and `pdf-sdk`'s untyped rejections move to codes.
- **Properties, never pixels or bytes, for engine-specific work.** Rendering, decoding and encoding differ by engine. Vectors may assert their properties, such as sizes and frame counts, but never their pixels or encoded bytes.
- **One copy of every case:** the TypeScript tests run the same files a port would, so the vectors can't drift from the reference implementation. Cases may be generated from the property tests' generators, with a fixed seed, and checked in.

### 6. No new runtime dependency

Validating vectors and documents against their schemas is test-only. The SDKs keep their hand-written validators at runtime, and those must accept exactly what the schemas accept, which the vectors check.

### 7. Adoption

- **Each SDK adds its format records, schemas and vectors in its own pull requests,** after its current work. It starts with the logic that already has property tests: the command reducers of `image-sdk` and `video-sdk`, `audio-sdk`'s reducer, and `image-sdk`'s geometry.
- **The shared pieces come first,** in `sdk-config`, as test-only entries like `testing/audio-output` ([ADR 0043](0043-no-audio-output-in-firefox-tests.md)): the `hm-conformance` file's JSON Schema, and a small loader that runs a directory of cases in Vitest.

### 8. Conventions from the first adoption

`audio-sdk` adopted this record first ([audio-sdk#34](https://github.com/ie-huss-martinez/audio-sdk/pull/34), [`docs/formats/hm-audio-plan.md`](https://github.com/ie-huss-martinez/audio-sdk/blob/main/docs/formats/hm-audio-plan.md)). What it settled holds for every SDK.

- **The same rejection codes everywhere,** each with a `details.reason`:

  | Code | When | Reasons, for example |
  |---|---|---|
  | `UNSUPPORTED_FORMAT` | A document of another format, or of a later version | `unknown-format`, `unknown-format-version` |
  | `INVALID_DOCUMENT` | Any other invalid document | `malformed-document`, `unknown-source`, `duplicate-key` |
  | `INVALID_COMMAND` | A command that doesn't apply | the SDK's own tokens, such as `unknown-clip` |

  Each SDK's reasons are its own, and listed in its format record. The codes are the same in every SDK, so a host handles them the same way.
- **Strict schemas and readers.** Every object in a schema sets `additionalProperties: false`. Readers and reducers refuse an unknown field rather than dropping it, so they accept exactly what the schemas accept, and a later version's document can't be misread as an earlier one. Property tests check that the runtime never accepts anything its schema refuses.
  - **A testing pitfall:** build mutated objects with own properties, such as with `Object.defineProperty`. Assigning `obj.__proto__ = …` sets the prototype instead of adding a field, so the test silently checks nothing.
- **Hostile keys.** Maps keyed by ids, such as sources, must treat `__proto__`, `constructor` and `toString` as ordinary keys, and the vectors include each of them, so every port is checked the same way.
- **Schemas ship with the package.** Each SDK lists `formats/` in its `package.json` `files`, so a host can validate documents against the schemas that match its installed reader. `conformance/` stays in the repository: it's for ports and the SDK's own tests, not for hosts.

## Alternatives considered

- **Share code instead, such as WebAssembly built from one language:** it ties every port to one toolchain and its runtime, and still needs formats for documents to move between apps.
- **Document the formats in prose only:** a port can't be checked against prose, and prose drifts from the code.
- **Inline binary data as base64:** simple, but documents grow by a third, the same image is stored again for every use, and hashing a document hashes its images.
- **Exact floats everywhere:** computed values can't be bit-identical across languages' maths libraries, so tests would fail on correct ports.
- **Vectors in a separate repository:** they'd drift from the implementation they describe, and every change would need two pull requests.

## Consequences

- A port in another language can prove its behaviour by passing the same vectors, and documents can move between apps through a versioned, schema-checked format.
- Each SDK takes on work: format records, schemas, migrations for breaking changes, stable rejection reasons, and the vectors.
- `pdf-sdk` changes the most: it gets codes for its rejections, asset references for its images, and an integer grid for its positions.
- `audio-sdk`, the first adopter, still has two follow-ups from section 8. Its package `files` lists only `dist`, so `formats/` must be added. And its 158 vectors have no hostile keys yet, though one of its unit tests already covers a `__proto__` source id.
- Format changes become more deliberate, because each breaking change needs a version bump and a migration.
