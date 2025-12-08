--
-- PostgreSQL database dump
--

\restrict SLzgxg4zwh5DzQPasVMvOzQ1f6JHRZ0WJqeZ0DvbqDKPm2jF2FrwpkG9tgM8f58

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: get_notes(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_notes(uid uuid, key text) RETURNS TABLE(id uuid, plaintext text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  return query
  select notes.id as note_id,
         pgp_sym_decrypt(notes.content, key) as plaintext,
         notes.created_at
  from notes
  where notes.user_id = uid;
end;
$$;


--
-- Name: insert_note(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_note(plaintext text, uid uuid, key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  insert into notes (content, user_id)
  values (pgp_sym_encrypt(plaintext, key), uid);
end;
$$;


--
-- Name: profiles_plan_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profiles_plan_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  jwt_role text := current_setting('request.jwt.claim.role', true);
begin
  -- Allow service/admin (auth.uid() is null for service key) to change plan
  if tg_op = 'UPDATE'
     and new.plan is distinct from old.plan
     and auth.uid() is not null
     and coalesce(jwt_role, '') not in ('service_role', 'supabase_admin') then
    raise exception 'Plan changes are restricted to service_role';
  end if;
  return new;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: update_user_last_seen(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_last_seen() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into public.users (user_id, created_at, last_seen)
  values (new.user_id, now(), now())
  on conflict (user_id) do update set last_seen = excluded.last_seen;
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: composer_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.composer_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: composer_saves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.composer_saves (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id text NOT NULL,
    kind text DEFAULT 'unknown'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: note_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.note_metadata (
    note_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pinned boolean DEFAULT false,
    tags text[] DEFAULT '{}'::text[],
    versions jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    content bytea NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text,
    stripe_event_id text NOT NULL,
    stripe_checkout_id text,
    amount integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    plan text DEFAULT 'free'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_seen timestamp with time zone DEFAULT now()
);


--
-- Data for Name: composer_activity; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.composer_activity (id, client_id, created_at) FROM stdin;
c5d72f67-c7bf-455e-a4b4-d6fa7e129fd7	bdb8e0f4-1fd9-4a2e-af71-b04694c17674	2025-12-07 22:24:57.001121+00
d9dae077-2cee-409d-9214-9e0224e2e881	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:47:59.320543+00
dc534387-1906-4176-81f3-5e7eab364460	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:52:09.54115+00
9162a310-9601-4c51-90ae-d91226e22d46	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:52:54.409228+00
e4b10fba-775c-40f5-a697-df199b0cacb9	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:53:26.40785+00
a576aecd-769b-4ba5-b2ea-f720c07ac95d	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:54:05.239181+00
272cae81-5647-48e8-82c9-8e44222843bb	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:54:58.275483+00
24842748-8914-4a70-844f-0e0abd7d9926	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:55:39.126402+00
28e4f0e8-54d4-4828-9861-983a0264460d	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:56:09.413479+00
abb3a127-5a4e-4c80-bb55-eed3f2603bc5	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:57:10.760623+00
0a69818b-24ea-48a7-a1b5-4e600ce2fcb8	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:57:40.600826+00
1d8379ba-bdf9-4cbe-a04a-c615e7533fe6	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:58:11.632932+00
32a008bb-fc63-42bf-b341-b6c9ddb49cea	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 22:58:41.501669+00
0f9c8959-a1ee-4a90-a016-12d5fcc9a6b8	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:00:36.854547+00
f2fb2a73-3572-4114-933a-fb3274d1f7d5	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:01:06.525259+00
10175c43-4c09-4790-b8b8-6f6034b1ac6f	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:08:53.338302+00
bb5882b5-158c-4a86-8724-d4077fe45141	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:09:22.932716+00
305dcfdc-90e7-4c45-a1eb-b2f587545b9c	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:10:07.960061+00
62942c85-2ffc-4fd9-bde8-5654b0447813	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:10:38.00068+00
cfcaee54-820e-4d48-af5d-897c288603f6	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:11:09.387615+00
dd6ed5c7-713d-48ad-8ba1-ea5eb75b0f68	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:11:39.392996+00
024d8bd2-b771-4998-be12-2b4f03af9340	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:12:13.910036+00
65caa4c6-03da-450a-839d-1127abde598d	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:12:45.536473+00
d28ad949-114a-4409-9a9d-e3e60b33e0c7	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:27:56.360395+00
f154ab83-97c2-415c-88a6-82d5d523d09a	e29e1ae1-784b-492a-889e-f6a13baf161c	2025-12-07 23:28:29.076918+00
\.


--
-- Data for Name: composer_saves; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.composer_saves (id, client_id, kind, created_at) FROM stdin;
35d9779c-b1fd-4749-8486-fc3613efe7ad	e29e1ae1-784b-492a-889e-f6a13baf161c	local	2025-12-07 22:54:39.939796+00
56369c3f-8982-4f60-92c3-735bd76cdced	e29e1ae1-784b-492a-889e-f6a13baf161c	local	2025-12-07 22:56:47.633997+00
a909a416-4b39-4c25-b4c3-3a1663a39e3f	e29e1ae1-784b-492a-889e-f6a13baf161c	local	2025-12-07 22:59:11.299464+00
95260da5-183d-4717-ad0f-2e407f177bbd	e29e1ae1-784b-492a-889e-f6a13baf161c	local	2025-12-07 23:01:17.509862+00
e51a53ba-5ee1-4524-b816-1d1e212dccf9	e29e1ae1-784b-492a-889e-f6a13baf161c	local	2025-12-07 23:09:56.952622+00
f835273e-56ed-48bb-a9bd-b195154d3b1a	e29e1ae1-784b-492a-889e-f6a13baf161c	local	2025-12-07 23:12:53.607114+00
4dc806e8-2bad-4899-96d4-d6cddf2533d9	e29e1ae1-784b-492a-889e-f6a13baf161c	local	2025-12-07 23:28:01.409367+00
b70dace2-126c-4e7b-8059-01fa4ec09121	e29e1ae1-784b-492a-889e-f6a13baf161c	local	2025-12-07 23:28:38.54239+00
\.


--
-- Data for Name: note_metadata; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.note_metadata (note_id, user_id, pinned, tags, versions, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notes (id, content, user_id, created_at) FROM stdin;
f1d2c005-0bb7-4dbd-9ba5-b17970350712	\\xc30d040703020b244eb05562431373d23d013202ce48b7542be8f9297e5c4e75f6cf609a3786af95c1f56c1efd2a8123d78be0344b1171e009c9d6b0cbcd6b14dd2959e2df60991b9b7ab2aa8672	25880691-ffa8-467f-ac4d-3dfdd4b91a55	2025-11-30 13:01:19.369602+00
e3e84cfb-95fa-46b6-b65e-27f026facc18	\\xc30d04070302e019ffe86e9c233574d26601f50d7a0ace30cb9c60cad88c8951f467b60d7a594dad1497fd580638663cdafdd19be7dfff4603e0167bf090e6e7542fa5818cc653b2c985b321e04b89f47ec6df26f2bae31319b9c627b95b2d9e16e288dc791f6ba563c9c6748082fedbbc9dbf9ddf9a36	25880691-ffa8-467f-ac4d-3dfdd4b91a55	2025-11-30 13:01:51.74828+00
47d625b1-1873-478d-a0c6-8cf1855d81cf	\\xc30d040703025030ebf3472a19a960d27301abe972b78f24335acea03384ef4f297c5503e199206cd5f2eb7570482a06bcbcce15a68a497b2eed9c6603b71664e23f383455a724f31184c078742d33f7d048ce18bbf06d6279dac65a99991f97ce8bd961abaf2366e1288704a0176adafb5dab22d30d521b5451f90bc1302afad381a302	25880691-ffa8-467f-ac4d-3dfdd4b91a55	2025-11-30 13:02:30.731448+00
91540d6d-d842-47fc-8db5-e41e8e5575dd	\\xc30d040703024e83dfa07c3f437161d267019da544cd8ea9c82f7e4b1d0f60683e01a24f74ee53913fca191f1d598ef77cea4b952a227172b4a208645fc04ad307e89bd7d4e3b47b32354339d5a5541f7ffb9ed229ba7667e89458cca43102f491dfb4c1f85bb91070e1c5934fa4bb0b6fe6f3a17ec5b39a	25880691-ffa8-467f-ac4d-3dfdd4b91a55	2025-11-30 13:03:01.063822+00
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payments (id, user_id, email, stripe_event_id, stripe_checkout_id, amount, currency, status, created_at) FROM stdin;
8fff84d0-c104-4033-a5e5-f507c5902ecb	25880691-ffa8-467f-ac4d-3dfdd4b91a55	robhutters@gmail.com	evt_1Sc21tIBl5GzNxVKSTtpOWPk	cs_test_a1yccPxxWwTKaUCzNGfgJR7J7DQKDOW3Sg0GLXRyuxxNc7Gy1KB3m5tMZu	1500	eur	paid	2025-12-08 10:50:59.203267+00
3fe44b1d-e6f2-422f-b34e-3022b782d45e	25880691-ffa8-467f-ac4d-3dfdd4b91a55	robhutters@gmail.com	evt_1Sc29FIBl5GzNxVKGzmIGgLw	cs_test_a1g22icuyYYH7M0SxSeJ4ubTfvWMWZ1yw6UqP6kLOOrD1vbB0QZhLHku9i	1500	eur	paid	2025-12-08 10:58:34.65134+00
56ed5984-bd59-45f0-9e89-f2442698454d	25880691-ffa8-467f-ac4d-3dfdd4b91a55	robhutters@gmail.com	evt_1Sc2DVIBl5GzNxVK1IlXoWbT	cs_test_a1sZ5UtvJnWPGa3P8opfh36JkXVs5mqEuo0yz4qIyKClXMxbBcB9HiozOk	1500	eur	paid	2025-12-08 11:02:57.854099+00
44346007-1d3f-4721-9686-dc2ab6454afa	25880691-ffa8-467f-ac4d-3dfdd4b91a55	robhutters@gmail.com	evt_1Sc2FZIBl5GzNxVKeSqoWkor	cs_test_a1xZSmjoNYWmMyim0bHSqWESsFIPFWlzJYu4faGKMqjqaHYvv3Cztijzli	1500	eur	paid	2025-12-08 11:05:06.376057+00
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, email, plan, created_at, updated_at) FROM stdin;
25880691-ffa8-467f-ac4d-3dfdd4b91a55	robhutters@gmail.com	pro	2025-12-08 10:44:16.871743+00	2025-12-08 11:05:06.508493+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (user_id, created_at, last_seen) FROM stdin;
25880691-ffa8-467f-ac4d-3dfdd4b91a55	2025-11-30 13:01:19.369602+00	2025-11-30 13:03:01.063822+00
\.


--
-- Name: composer_activity composer_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composer_activity
    ADD CONSTRAINT composer_activity_pkey PRIMARY KEY (id);


--
-- Name: composer_saves composer_saves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.composer_saves
    ADD CONSTRAINT composer_saves_pkey PRIMARY KEY (id);


--
-- Name: note_metadata note_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_metadata
    ADD CONSTRAINT note_metadata_pkey PRIMARY KEY (note_id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: payments_stripe_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_stripe_event_id_idx ON public.payments USING btree (stripe_event_id);


--
-- Name: payments_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_user_id_idx ON public.payments USING btree (user_id);


--
-- Name: note_metadata note_metadata_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER note_metadata_updated_at BEFORE UPDATE ON public.note_metadata FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles profiles_plan_guard_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_plan_guard_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_plan_guard();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notes trg_notes_user_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notes_user_touch AFTER INSERT ON public.notes FOR EACH ROW EXECUTE FUNCTION public.update_user_last_seen();


--
-- Name: note_metadata note_metadata_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_metadata
    ADD CONSTRAINT note_metadata_note_id_fkey FOREIGN KEY (note_id) REFERENCES public.notes(id) ON DELETE CASCADE;


--
-- Name: note_metadata note_metadata_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.note_metadata
    ADD CONSTRAINT note_metadata_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notes notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: users users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: composer_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.composer_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: composer_saves; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.composer_saves ENABLE ROW LEVEL SECURITY;

--
-- Name: note_metadata; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.note_metadata ENABLE ROW LEVEL SECURITY;

--
-- Name: note_metadata note_metadata no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "note_metadata no delete" ON public.note_metadata FOR DELETE USING (false);


--
-- Name: note_metadata note_metadata select own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "note_metadata select own" ON public.note_metadata FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: note_metadata note_metadata update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "note_metadata update own" ON public.note_metadata FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: note_metadata note_metadata upsert own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "note_metadata upsert own" ON public.note_metadata FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments no write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payments no write" ON public.payments USING (false);


--
-- Name: payments payments read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payments read own" ON public.payments FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles insert self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: profiles profiles no delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles no delete" ON public.profiles FOR DELETE USING (false);


--
-- Name: profiles profiles read own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles read own" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: profiles profiles update self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict SLzgxg4zwh5DzQPasVMvOzQ1f6JHRZ0WJqeZ0DvbqDKPm2jF2FrwpkG9tgM8f58

