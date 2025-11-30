This app is a BlueSky composer with autosplit at 300 chars, encrypted note storage in Supabase, and per-user access control.

## Getting Started
```bash
npm install
npm run dev
```
Visit http://localhost:3000.

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
