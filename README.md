# Strength Ledger

Your private training log and coach. It works as a Home Screen app on the iPhone and a Dock app on the Mac. It has no App Store listing, needs no paid accounts, and has no outside dependencies.

- **Offline first.** Every set is saved on the device first. Sync runs in the background when there is signal.
- **Sync.** A Cloudflare Worker with a D1 database (free plan) syncs the devices. Edits merge per field, and deletes never come back.
- **Coach.** Block 1 is Push / Pull / Legs × 2 on a flexible Monday–Sunday week. Targets come from your history, using estimated strength = weight × (1 + reps ÷ 30).
- **History.** Imports your Fitbod export and your earlier app's log. Importing is safe to repeat.
- **Backups.** The server keeps a daily snapshot for 90 days, and you can export a file whenever you like.

## Layout

| Path | What it is |
| --- | --- |
| `web/` | The app: `index.html`, `styles.css`, service worker, and TypeScript views in `web/src/`. |
| `src/` | Shared logic: progression engine, importers, program, sync clock and merge. |
| `worker/` | Cloudflare Worker (`/api/setup`, `/api/sync`, `/api/backups`) and the D1 schema. |
| `dist/` | The built app, committed so Cloudflare can deploy it without a build step. |
| `tests/`, `e2e/` | Unit tests, and end-to-end tests in Chromium at iPhone size. |
| `scripts/` | `build-web.ts` (build), `serve.ts` (local server with the Worker on SQLite), `replay.ts`. |

## Commands (Node.js 22.18 or later; nothing to install)

```sh
node scripts/build-web.ts            # build dist/
node scripts/serve.ts 8787           # run locally at http://127.0.0.1:8787 (setup code TEST-SETUP-CODE)
node --test tests/*.test.ts          # unit tests
node --test e2e/app.e2e.ts           # end-to-end tests (needs Playwright's Chromium)
```

Your exports belong in `data/private/`. That folder is never committed. Without it, the import tests skip themselves.

## Deploying

`wrangler.jsonc` points at the D1 database and KV namespace in your Cloudflare account. Cloudflare Workers Builds is connected to this repository and runs `npx wrangler deploy` on every push to `main`. After changing the app, run `node scripts/build-web.ts` and commit `dist/` together with your changes.
