This app is a BlueSky composer with autosplit at 300 chars, encrypted note storage in Supabase, and per-user access control.

## Getting Started
```bash
npm install
npm run dev
```
Visit http://localhost:3000.

## Deploying safely
- Use `vercel` (no `--prod`) for preview/staging deployments. Reserve `vercel --prod` for the main production branch only.
- Scope env vars per environment in Vercel (Preview vs Production). Keep test/staging keys in Preview, live keys in Production.
- Stripe: use test-mode keys/endpoint + test webhook secret for staging; live keys/endpoint + live webhook secret for production.

## Security & RLS
- Notes are encrypted server-side; the encryption key lives only on the server.
- Client calls API routes with the user’s Supabase session token; routes use the service-role key and enforce user ownership.
- Enable RLS on `public.notes` and add owner-only policies:
```sql
alter table public.notes enable row level security;

create policy "notes_select_owner" on public.notes
  for select using (auth.uid() = user_id);

create policy "notes_insert_owner" on public.notes
  for insert with check (auth.uid() = user_id);

create policy "notes_delete_owner" on public.notes
  for delete using (auth.uid() = user_id);
```
Keep the service-role key server-side only. If you use RPCs, continue passing the auth token so `auth.uid()` resolves.

## Pro Features

Cloud sync (already live)

Version history & restore: keep previous drafts per note; “restore last version”.

Backup/export: one-click export (txt/JSON), scheduled email/Drive/Dropbox.

Organization: tags and pinned notes; search/filter by tag or text (basic search free, advanced filters Pro).

Limits: raise cloud storage caps (e.g., free up to X notes/KB; Pro unlimited).

QoL: templates/snippets for common posts, Markdown support, preview with character counters.
