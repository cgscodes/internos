-- Additive AI analysis snapshots and database-backed request admission.
begin;
create table public.job_match_analyses (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 job_id uuid not null references public.jobs(id) on delete cascade,
 resume_id uuid not null,
 model text not null check(length(model) between 1 and 120),
 prompt_version text not null check(length(prompt_version) between 1 and 80),
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 job_hash text not null check(job_hash ~ '^[a-f0-9]{64}$'),
 resume_hash text not null check(resume_hash ~ '^[a-f0-9]{64}$'),
 match_score integer not null check(match_score between 0 and 100),
 findings jsonb not null check(jsonb_typeof(findings)='object' and octet_length(findings::text)<=65536),
 usage jsonb not null default '{}' check(jsonb_typeof(usage)='object' and octet_length(usage::text)<=2048),
 created_at timestamptz not null default now(),
 foreign key(resume_id,user_id) references public.resumes(id,user_id) on delete cascade,
 unique(user_id,input_hash)
);
alter table public.job_match_analyses enable row level security;
create policy match_owner_read on public.job_match_analyses for select to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.jobs j where j.id=job_id));
create policy match_owner_insert on public.job_match_analyses for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.jobs j where j.id=job_id)
 and exists(select 1 from public.user_jobs b where b.job_id=job_match_analyses.job_id and b.user_id=(select auth.uid())));
create policy match_owner_update on public.job_match_analyses for update to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.jobs j where j.id=job_id))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.jobs j where j.id=job_id)
 and exists(select 1 from public.user_jobs b where b.job_id=job_match_analyses.job_id and b.user_id=(select auth.uid())));
create policy match_owner_delete on public.job_match_analyses for delete to authenticated using(user_id=(select auth.uid()));
create index job_match_owner_job_resume on public.job_match_analyses(user_id,job_id,resume_id,created_at desc);

-- No direct client writes: deleting analyses cannot reset quotas or active leases.
create table public.ai_match_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null default now(), requests integer not null default 0,
 lease_id uuid, lease_until timestamptz
);
alter table public.ai_match_limits enable row level security;
revoke all on public.ai_match_limits from public,authenticated;
create function public.begin_job_match(p_job_id uuid,p_resume_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_limit public.ai_match_limits; v_lease uuid:=gen_random_uuid();
begin
 if v_user is null then raise exception 'Unauthorized' using errcode='28000'; end if;
 if not exists(select 1 from public.resumes where id=p_resume_id and user_id=v_user)
 or not exists(select 1 from public.jobs j join public.user_jobs b on b.job_id=j.id
   where j.id=p_job_id and b.user_id=v_user and (j.created_by is null or j.created_by=v_user)) then
  raise exception 'Job or resume not found' using errcode='P0002';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_user::text||':ai-match',0));
 insert into public.ai_match_limits(user_id) values(v_user) on conflict do nothing;
 select * into v_limit from public.ai_match_limits where user_id=v_user for update;
 if v_limit.lease_until>clock_timestamp() then raise exception 'Analysis already running' using errcode='55P03'; end if;
 if v_limit.window_start<=clock_timestamp()-interval '10 minutes' then v_limit.requests:=0; v_limit.window_start:=clock_timestamp(); end if;
 if v_limit.requests>=10 then raise exception 'Match request limit reached' using errcode='53300'; end if;
 update public.ai_match_limits set requests=v_limit.requests+1,window_start=v_limit.window_start,
 lease_id=v_lease,lease_until=clock_timestamp()+interval '90 seconds' where user_id=v_user;
 return v_lease;
end $$;
create function public.end_job_match(p_lease uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Unauthorized' using errcode='28000'; end if;
 update public.ai_match_limits set lease_id=null,lease_until=null where user_id=auth.uid() and lease_id=p_lease;
end $$;
revoke all on function public.begin_job_match(uuid,uuid) from public;
revoke all on function public.end_job_match(uuid) from public;
grant execute on function public.begin_job_match(uuid,uuid) to authenticated;
grant execute on function public.end_job_match(uuid) to authenticated;
grant select,insert,update,delete on public.job_match_analyses to authenticated;
notify pgrst,'reload schema';
commit;
