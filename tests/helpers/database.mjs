import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export async function createTestDatabase() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create schema auth; create schema storage;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;`);
  for (const file of [
    "202611110001_initial.sql",
    "002_application_tracking.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  await db.exec(
    "grant usage on schema public,auth,storage to authenticated; grant select,insert,update,delete on all tables in schema public,storage to authenticated;",
  );
  return db;
}
