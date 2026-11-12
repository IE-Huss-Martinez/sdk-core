# 0031. Platform decoders that only run on the page

- **Status:** Accepted
- **Date:** 2026-11-12
- **Refines:** [ADR 0012](0012-hostile-input-and-no-network.md)'s "parse only in workers" and [ADR 0020](0020-file-policy.md)'s limits, for decoders that the browser provides only on the page

## Context

[ADR 0012](0012-hostile-input-and-no-network.md) requires untrusted bytes to be parsed only in workers that can be terminated, and [ADR 0020](0020-file-policy.md) checks every file against limits on size, decoded size and processing time.

Some media can only be decoded by the browser, and some of the browser's decoders exist only on the page. Web Audio's `decodeAudioData` needs a `BaseAudioContext`, and neither `AudioContext` nor `OfflineAudioContext` is available in workers. Image and video SDKs will meet the same question with `<img>`, media elements and their fallbacks.

`audio-sdk`'s [ADR 0001](https://github.com/ie-huss-martinez/audio-sdk/blob/main/docs/adr/0001-audio-engines.md) records how it reads the rule:
- its own parsing, a probe that walks every packet, runs in the worker;
- only probed files within limits reach `decodeAudioData` on the page;
- the decoded length is checked against the probe's bound.

[sdk-core#57](https://github.com/ie-huss-martinez/sdk-core/issues/57) asks for one family rule, so every SDK treats platform decoders the same way, as [ADR 0028](0028-third-party-engines.md) did for engines' own workers.

The risk is not the decoder's code itself. It's the browser's hardened, sandboxed code, in the same position as image decoding behind any `<img>`. The risk is what a file can make it do: a few megabytes of compressed audio or image data can decode to gigabytes, and a header can declare a small size while the data carries far more.

## Decision

A browser decoder that isn't available in workers may run on the page, if the SDK does all of the following.

1. **Prefers the worker whenever it can.** A platform decoder that's available in workers on every supported browser ([ADR 0013](0013-browser-and-react-support.md)), such as `createImageBitmap` from a `Blob` or WebCodecs, runs in the worker. The page is only for decoders that don't exist there.
2. **Probes the file in a worker first, and refuses what it can't probe.** The SDK's own code identifies the format and codec, and establishes an upper bound on the decoded output: frames, pixels or bytes. A file whose format isn't recognised, or whose bound can't be established, fails closed with a specific code and never reaches the decoder.
3. **Derives the bound from the data, not from a header's claim.** The probe walks what the decoder will actually decode, such as every packet or frame, and a header that claims more than the data can carry is an error. The probe is the SDK's own parser of hostile input, so it's held to that bar: loops that always advance, sizes checked against the bytes that remain, fixed nesting limits, and truncation and fuzz tests.
4. **Checks every limit against that bound before decoding**, as [ADR 0020](0020-file-policy.md) requires.
5. **Checks the decoded output against the bound.** Output beyond the bound, plus a per-codec tolerance that the SDK's own ADR documents and justifies, is discarded as invalid.
6. **Gives the decoder only the file's bytes, and only the browser's own decoders run on the page.** Third-party code that parses files still runs in workers ([ADR 0028](0028-third-party-engines.md)). The decoder gets a fresh buffer it may detach, never one the caller still owns ([ADR 0018](0018-worker-rpc-protocol.md)).
7. **Never shows the decoder's errors.** A failure becomes the SDK's own code, such as `DECODE_FAILED`, with `details` that name the format or codec, never the browser's message ([ADR 0014](0014-accessibility-and-translatable-text.md)).
8. **Applies `maxProcessingTime`.** A page-side decode can't be terminated the way a worker can, so when the time is up, the SDK stops waiting, rejects with `PROCESSING_TIME_EXCEEDED`, and discards the result whenever it arrives.

## Alternatives considered

- **Require every decoder to run in a worker:** audio editing would then need a WebAssembly decoder for every compressed format. That's a large third-party dependency for each codec, with its own supply-chain and licence questions, in place of the browser's maintained decoders.
- **Decode on the page without a probe:** a small file could make the decoder allocate gigabytes on the page, and no limit could be checked until it already had.
- **Trust a header's declared duration or size for the limits:** a header can declare far less than the data carries, and the decoder decodes the data.

## Consequences

- SDKs can use the browser's decoders for formats that only the page can decode, with the same limits as any other file.
- The probe becomes security-critical code in each SDK, and gets the testing that hostile-input parsers get.
- **Some risk remains, and it's accepted.**
  - **The decoder runs in the page's renderer process,** like any media the page displays.
  - **A hung decode can't be stopped, only abandoned.** That also means time limits can't free its memory before it finishes. The decoded-size bound, checked before decoding, is what keeps that memory small.
- When a decoder becomes available in workers on every supported browser, rule 1 moves it there. Each SDK's own ADR records which decoders it uses on the page, and why.
