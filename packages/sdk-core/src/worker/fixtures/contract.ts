import { SdkError } from "../../errors/sdk-error.js";

export type PdfErrorCode = "FILE_TOO_LARGE" | "PDF_ENCRYPTED";

export class PdfError extends SdkError<PdfErrorCode> {
  override readonly name = "PdfError";
}

/** The contract served by test.worker.ts. */
export interface TestWorker {
  echo: { input: string; output: string };
  progress: { input: { steps: number }; output: string; progress: number };
  /** Waits, and stops early when the call is cancelled. */
  wait: { input: { ms: number }; output: string };
  /** Blocks the worker's event loop, so it can't notice a cancel. */
  spin: { input: { ms: number }; output: string };
  fail: { input: { code: PdfErrorCode }; output: never };
  byteLength: { input: { data: ArrayBuffer | Uint8Array }; output: number };
  /** Returns a fresh buffer, and keeps a reference to check that it was transferred. */
  freshBuffer: { input: undefined; output: ArrayBuffer };
  lastFreshBufferDetached: { input: undefined; output: boolean };
  /** Returns bytes 4–7 of a 16-byte buffer the worker keeps. */
  cacheSlice: { input: undefined; output: Uint8Array };
  cacheByteLength: { input: undefined; output: number };
  wasmView: { input: { whole: boolean }; output: Uint8Array };
  notCloneable: { input: undefined; output: { callback: () => void } };
  crashInTimer: { input: undefined; output: string };
  crashWithRejection: { input: undefined; output: string };
}
