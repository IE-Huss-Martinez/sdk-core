---
"@hussmartinez/sdk-config": patch
---

`hm-test-visual` no longer fails with "Duplicate mount point: /work/node_modules" in a workspace whose `pnpm-workspace.yaml` lists the root as `"."`, as Changesets needs. It mounts the root's `node_modules` once, and ignores entries that point outside the repository.
