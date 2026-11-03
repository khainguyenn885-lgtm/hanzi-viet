# Public cloud deployment

The cloud target is Cloudflare Workers for the React static assets and API, with Cloudflare D1 for the shared read-only dictionary and anonymous error reports. It needs no VPS or always-on server. The development/local Node + SQLite mode remains available.

## What is public and what stays per browser

- Vocabulary and stroke-order data are public to all visitors.
- Saved word IDs, dark-mode choice, writing mistakes, and personal mnemonics stay in each visitor's browser `localStorage`; there is no shared user table or account login.
- Error reports are accepted into D1 and have no public read endpoint. The report endpoint has a per-browser rate limit.
- AI translation is disabled until an owner configures `LLM_MODEL` and stores `LLM_API_KEY` as a Cloudflare secret. Each visitor must still opt in before sending text. The Worker never logs the text. AI calls have a per-browser rate limit; set a spending limit with the selected AI provider as well.
- The initial address will be a public `*.workers.dev` URL. A custom domain is optional and requires owning a domain.

## Local Cloudflare preview

From Windows PowerShell in this folder:

```powershell
pnpm install
pnpm cloud:seed:generate
pnpm cloud:migrate:local
pnpm cloud:seed:local
pnpm cloud:dev
```

Open `http://127.0.0.1:8788`. This preview uses a local D1 database and does not publish anything.

## Publish to a Cloudflare account

1. Sign in to the Cloudflare account that should own the public site: `pnpm --filter @hanzi/cloud exec wrangler login`.
2. Create the D1 database: `pnpm cloud:db:create`. Wrangler replaces the local placeholder ID in `apps/cloud/wrangler.jsonc` with the new database ID.
3. Set the model name in `apps/cloud/wrangler.jsonc` under `vars.LLM_MODEL` if AI translation is wanted.
4. Generate the seed file, then apply the schema and seed the dictionary: `pnpm cloud:seed:generate`, `pnpm cloud:migrate:remote`, then `pnpm cloud:seed:remote`.
5. Store the provider key in Cloudflare, never in Git: `pnpm --filter @hanzi/cloud exec wrangler secret put LLM_API_KEY`.
6. Publish: `pnpm cloud:deploy`. Wrangler prints the public `workers.dev` URL.

Cloudflare's free tier is appropriate for a first public pilot, not an unlimited capacity promise. D1 currently includes 5 million rows read and 100,000 rows written per day, and a 500 MB maximum database size on the Free plan. If limits are reached, D1 queries stop until limits reset or the account changes plan. AI provider charges are separate. Monitor both services after sharing the public URL.

The two rate-limit bindings are intentionally generous for ordinary learning and approximate per Cloudflare location. They are an abuse guard, not a hard worldwide billing cap. Browser-only saved words are private to that browser and do not sync between devices.
