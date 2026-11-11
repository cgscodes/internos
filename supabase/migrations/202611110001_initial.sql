-- All personal data is scoped to auth.uid(); no service-role key is used by the app.
create type public.application_status as enum ('Saved','Preparing','Ready','Applied','Assessment','Interview','Offer','Rejected','Withdrawn');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default 'Your workspace', education text not null default '', skills text not null default '', interests text not null default '', locations text not null default '', created_at timestamptz not null default now()
);
create table public.companies (id uuid primary key default gen_random_uuid(), name text not null, website text, created_at timestamptz not null default now());
create table public.jobs (
 id uuid primary key default gen_random_uuid(), company_id uuid references public.companies(id) on delete set null, company text not null, title text not null, location text not null default '', type text not null default 'Internship' check(type in ('Internship','Co-op','Graduate')), source text not null default 'Manual curation', url text not null default '', deadline date, created_at timestamptz not null default now()
);
create table public.user_jobs (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, job_id uuid not null references public.jobs(id) on delete cascade, created_at timestamptz not null default now(), unique(user_id,job_id));
create table public.resumes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, file_name text not null, size bigint not null check(size > 0 and size <= 5242880), storage_path text not null unique, is_master boolean not null default false, parent_id uuid, created_at timestamptz not null default now(), unique(id,user_id), check (split_part(storage_path,'/',1)=user_id::text), foreign key(parent_id,user_id) references public.resumes(id,user_id) on delete cascade
);
create table public.resume_versions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, resume_id uuid not null, document_id uuid not null, label text not null, created_at timestamptz not null default now(), foreign key(resume_id,user_id) references public.resumes(id,user_id) on delete cascade, foreign key(document_id,user_id) references public.resumes(id,user_id) on delete cascade
);
create table public.applications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, job_id uuid references public.jobs(id) on delete set null, resume_id uuid, company text not null check(length(company) between 1 and 120), title text not null check(length(title) between 1 and 160), location text not null default '', type text not null default 'Internship' check(type in ('Internship','Co-op','Graduate')), source text not null default 'Manual entry', url text not null default '' check(url='' or url ~ '^https?://'), deadline text not null default '' check(deadline='' or deadline ~ '^\d{4}-\d{2}-\d{2}$'), important_date text not null default '' check(important_date='' or important_date ~ '^\d{4}-\d{2}-\d{2}$'), status public.application_status not null default 'Saved', notes text not null default '' check(length(notes)<=10000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), foreign key(resume_id,user_id) references public.resumes(id,user_id)
);
create table public.application_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, application_id uuid not null, description text not null, created_at timestamptz not null default now(), foreign key(application_id,user_id) references public.applications(id,user_id) on delete cascade
);
create table public.interviews (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, application_id uuid not null, scheduled_at timestamptz not null, format text not null default '', notes text not null default '', created_at timestamptz not null default now(), foreign key(application_id,user_id) references public.applications(id,user_id) on delete cascade
);
-- RLS applies to every table, including the read-only curated catalog.
do $$ declare t text; begin foreach t in array array['profiles','companies','jobs','user_jobs','resumes','resume_versions','applications','application_events','interviews'] loop execute format('alter table public.%I enable row level security',t); end loop; end $$;
create policy profile_owner on public.profiles for all to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy catalog_companies_read on public.companies for select to authenticated using (true);
create policy catalog_jobs_read on public.jobs for select to authenticated using (true);
do $$ declare t text; begin foreach t in array array['user_jobs','resumes','resume_versions','applications','interviews'] loop execute format('create policy owner_access on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',t); execute format('create index %I on public.%I(user_id)',t||'_user_id_idx',t); end loop; end $$;
create policy event_owner_read on public.application_events for select to authenticated using ((select auth.uid())=user_id);
create index application_events_user_date on public.application_events(user_id,created_at desc);
-- Bootstrap a private profile after OAuth signup. Pinned search_path protects definer functions.
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,full_name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'Your workspace')); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.log_application_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='INSERT' or old.status is distinct from new.status then
 insert into public.application_events(user_id,application_id,description) values(new.user_id,new.id,new.status::text || ' · ' || new.title || ' at ' || new.company);
 end if; return new;
end $$;
create trigger application_change after insert or update on public.applications for each row execute function public.log_application_change();
create function public.record_resume_version() returns trigger language plpgsql security definer set search_path='' as $$ begin if new.parent_id is not null then insert into public.resume_versions(user_id,resume_id,document_id,label) values(new.user_id,new.parent_id,new.id,new.name); end if; return new; end $$;
create trigger resume_version_created after insert on public.resumes for each row execute function public.record_resume_version();
revoke all on function public.handle_new_user() from public;
revoke all on function public.log_application_change() from public;
revoke all on function public.record_resume_version() from public;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('resumes','resumes',false,5242880,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do nothing;
create policy private_resume_read on storage.objects for select to authenticated using(bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy private_resume_upload on storage.objects for insert to authenticated with check(bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy private_resume_delete on storage.objects for delete to authenticated using(bucket_id='resumes' and (storage.foldername(name))[1]=(select auth.uid())::text);

create function public.touch_application() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger application_updated before update on public.applications for each row execute function public.touch_application();
create unique index one_master_resume_per_user on public.resumes(user_id) where is_master;
