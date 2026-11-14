# Phase 5.3 Runtime Packaging Handoff

The API server build is type-correct, but a plain Node import of `artifacts/api-server/dist/index.js` still fails before startup because workspace libraries expose TypeScript source paths rather than emitted JavaScript:

```text
Cannot find module .../lib/api-zod/src/generated/api.js
```

The same packaging pattern applies to `@workspace/safety-core` (`main` and `exports` point at `src/index.ts`, while its build emits declarations only).

Dev C changes required:

1. `lib/safety-core/tsconfig.json`: emit runtime JavaScript (ESM) alongside declarations.
2. `lib/safety-core/package.json`: point `main`/`exports.import` to emitted JavaScript and `exports.types` to emitted declarations; retain the existing public export surface.
3. `lib/api-zod`: provide a runtime build output for generated schemas and update its export map from `src/index.ts` to that output.
4. `lib/api-client-react`: provide a runtime/types export map compatible with the API server’s generated imports, or confirm it is not part of the server runtime graph.

Acceptance check after integration:

```bash
pnpm install --frozen-lockfile
pnpm build
node artifacts/api-server/dist/index.js
```

No protocol, cryptographic algorithm, generated contract, or Android implementation changes are required from Dev C/B for this handoff.
