// A repository shaped like an SDK's, for the tests of the browser test
// image's commands (hm-in-image and hm-test-visual).
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export const IMAGE =
  "mcr.microsoft.com/playwright:v1.65.0-noble@sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe";

/** The integrities sdk-core's pnpm-lock.yaml records for pnpm 12.18.0. */
export const PINNED = {
  version: "12.18.0",
  integrity:
    "sha512-nXiC1dyCFH7PxOBiqjSDTgrQKWcQoYN6ERWuASEn02txCeMhrBWYod0KZVl2gbHpmRfhLtDXSerpEYeUM2O+sw==",
  binaries: {
    "linux-x64":
      "sha512-OJ+X2wcraldCwj75pCIerWARQSRpdfj0eBTs/2ODyhfeW46ylOnjTIE/GKra6Mn6E72/gBmXS8igrUioa+F9fQ==",
    "linux-arm64":
      "sha512-2dpyVBCHT+FfpuQh9i+7MXAqNWYLCvD5vYr5p6Eimxoga8USLnjbUgyj72AOrO0hjc5ri3TEFP3jiyBHjkSZpQ==",
  },
};

/**
 * A pnpm 12 lockfile, as pnpm writes it: a first document for the package
 * manager itself, then the dependencies'.
 *
 * @param {{ version?: string, integrity?: string, x64?: string }} [overrides]
 */
export const lockfile = ({
  version = "12.18.0",
  integrity = PINNED.integrity,
  x64 = PINNED.binaries["linux-x64"],
} = {}) => `---
lockfileVersion: '9.0'

importers:

  .:
    configDependencies: {}
    packageManagerDependencies:
      pnpm:
        specifier: ${version}
        version: ${version}

packages:

  '@pnpm/exe.linux-arm64@${version}':
    resolution: {integrity: ${PINNED.binaries["linux-arm64"]}}
    cpu: [arm64]
    os: [linux]
    libc: [glibc]

  '@pnpm/exe.linux-x64@${version}':
    resolution: {integrity: '${x64}'}
    cpu: [x64]
    os: [linux]
    libc: [glibc]

  pnpm@${version}:
    resolution: {integrity: ${integrity}}
    hasBin: true

---
lockfileVersion: '9.0'

importers:

  .: {}
`;

/** @type {string[]} */
const scratch = [];

/** Removes every repository made since the last call. Call it after each test. */
export async function cleanUp() {
  for (const dir of scratch.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * A repository shaped like image-sdk's: a FROM-only ci/Dockerfile, pnpm in
 * packageManager, and a workspace of the package, its e2e suite and examples.
 *
 * @param {Record<string, string>} [files] Files to add or replace.
 */
export async function repository(files = {}) {
  const root = await mkdtemp(join(tmpdir(), "hm-image-"));
  scratch.push(root);
  const all = {
    "package.json": JSON.stringify({
      name: "@hussmartinez/image-sdk-workspace",
      packageManager: "pnpm@12.18.0",
    }),
    "pnpm-workspace.yaml":
      "packages:\n  - packages/*\n  - e2e\n  # the examples\n  - examples/*\n\ncatalog:\n  x: ^1\n",
    "ci/Dockerfile": `# The browser test image.\nFROM ${IMAGE}\n`,
    "pnpm-lock.yaml": lockfile(),
    "packages/image-sdk/package.json": "{}",
    "e2e/package.json": "{}",
    "examples/vite/package.json": "{}",
    "examples/notes/README.md": "not a package",
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}
