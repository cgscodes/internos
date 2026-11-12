-- Apply AFTER the existing initial schema. No initial tables or personal records are recreated.
begin;

alter table public.companies add column created_by uuid references auth.users(id) on delete cascade;
alter table public.jobs add column created_by uuid references auth.users(id) on delete cascade;
alter table public.jobs add column description text not null default '';
alter table public.applications add column company_id uuid references public.companies(id);
alter table public.applications add column description text not null default '';
alter table public.applications add column applied_on date;
alter table public.applications add column attempt integer not null default 1 check (attempt > 0);
alter table public.application_events add column from_status public.application_status;
alter table public.application_events add column to_status public.application_status;

-- Leave all existing shared catalog rows shared and read-only; new personal rows are private.
drop policy catalog_companies_read on public.companies;
drop policy catalog_jobs_read on public.jobs;
create policy companies_visible on public.companies for select to authenticated
 using (created_by is null or created_by = (select auth.uid()));
create policy companies_owner_insert on public.companies for insert to authenticated
 with check (created_by = (select auth.uid()));
create policy companies_owner_update on public.companies for update to authenticated
 using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy companies_owner_delete on public.companies for delete to authenticated
 using (created_by = (select auth.uid()));
create policy jobs_visible on public.jobs for select to authenticated
 using (created_by is null or created_by = (select auth.uid()));
create policy jobs_owner_insert on public.jobs for insert to authenticated
 with check (created_by = (select auth.uid()));
create policy jobs_owner_update on public.jobs for update to authenticated
 using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy jobs_owner_delete on public.jobs for delete to authenticated
 using (created_by = (select auth.uid()));

create unique index private_company_name on public.companies(created_by, lower(btrim(name))) where created_by is not null;
create unique index private_job_identity on public.jobs(created_by, company_id, lower(btrim(title)), lower(btrim(location)), url) where created_by is not null;
-- Abort rather than silently remove any pre-existing duplicate linked applications.
create unique index application_attempt_identity on public.applications(user_id, job_id, attempt) where job_id is not null;
create unique index one_active_application_per_job on public.applications(user_id, job_id)
 where job_id is not null and status not in ('Rejected','Withdrawn');
create index applications_user_status on public.applications(user_id, status);
create index applications_user_deadline on public.applications(user_id, deadline);
create index jobs_owner on public.jobs(created_by);
create index companies_owner on public.companies(created_by);

alter table public.companies add constraint company_name_bounds check (length(btrim(name)) between 1 and 120) not valid;
alter table public.jobs add constraint job_content_bounds check (
 length(btrim(title)) between 1 and 160 and length(location)<=160 and length(source)<=120 and length(description)<=20000
 and (url='' or url ~ '^https?://')
) not valid;
alter table public.applications add constraint application_description_bounds check(length(description)<=20000) not valid;
alter table public.applications add constraint application_date_values check(
 (deadline='' or deadline::date is not null) and (important_date='' or important_date::date is not null)
) not valid;

-- Foreign keys alone do not enforce cross-user visibility of referenced jobs/companies.
create function public.check_tracking_links() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_table_name='jobs' then
  if new.company_id is not null and not exists(select 1 from public.companies c where c.id=new.company_id and (c.created_by is null or c.created_by=new.created_by)) then
   raise exception 'Company is not accessible' using errcode='23503';
  end if;
 elsif tg_table_name='applications' then
  if new.job_id is not null and not exists(select 1 from public.jobs j where j.id=new.job_id and (j.created_by is null or j.created_by=new.user_id)) then
   raise exception 'Job is not accessible' using errcode='23503';
  end if;
  if new.company_id is not null and not exists(select 1 from public.companies c where c.id=new.company_id and (c.created_by is null or c.created_by=new.user_id)) then
   raise exception 'Company is not accessible' using errcode='23503';
  end if;
  if new.applied_on is null and new.status in ('Applied','Assessment','Interview','Offer','Rejected','Withdrawn') then
   if tg_op='INSERT' or old.status in ('Saved','Preparing','Ready') then new.applied_on=current_date; end if;
  end if;
 elsif tg_table_name='user_jobs' then
  if not exists(select 1 from public.jobs j where j.id=new.job_id and (j.created_by is null or j.created_by=new.user_id)) then
   raise exception 'Job is not accessible' using errcode='23503';
  end if;
 end if;
 return new;
end $$;
create trigger tracking_job_links before insert or update on public.jobs for each row execute function public.check_tracking_links();
create trigger tracking_application_links before insert or update on public.applications for each row execute function public.check_tracking_links();
create trigger tracking_bookmark_links before insert or update on public.user_jobs for each row execute function public.check_tracking_links();

create or replace function public.log_application_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  insert into public.application_events(user_id,application_id,description,to_status)
  values(new.user_id,new.id,'Application created · '||new.company,new.status);
 elsif old.status is distinct from new.status then
  insert into public.application_events(user_id,application_id,description,from_status,to_status)
  values(new.user_id,new.id,old.status::text||' → '||new.status::text||' · '||new.company,old.status,new.status);
 elsif row(old.company,old.title,old.location,old.description,old.notes,old.deadline,old.important_date,old.applied_on,old.url,old.source,old.type)
 is distinct from row(new.company,new.title,new.location,new.description,new.notes,new.deadline,new.important_date,new.applied_on,new.url,new.source,new.type) then
  insert into public.application_events(user_id,application_id,description)
  values(new.user_id,new.id,'Application details updated · '||new.company);
 end if;
 return new;
end $$;

-- These transaction functions run AS THE CALLER. All normal grants, RLS, and triggers still apply.
create function public.resolve_tracking_company(p_id uuid, p_name text) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Unauthorized' using errcode='28000'; end if;
 if p_id is not null then
  select id into v_id from public.companies where id=p_id;
  if v_id is null then raise exception 'Company not found' using errcode='P0002'; end if;
 else
  if length(btrim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Company name required' using errcode='22023'; end if;
  select id into v_id from public.companies where lower(btrim(name))=lower(btrim(p_name)) order by created_by nulls first, id limit 1;
  if v_id is null then
   insert into public.companies(name,created_by) values(btrim(p_name),v_user) on conflict do nothing returning id into v_id;
   if v_id is null then select id into v_id from public.companies where created_by=v_user and lower(btrim(name))=lower(btrim(p_name)); end if;
  end if;
 end if;
 return v_id;
end $$;

create function public.save_tracking_job(p_data jsonb, p_create boolean) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid := (p_data->>'id')::uuid; v_company uuid; v_user uuid := auth.uid(); v_name text; v_result uuid;
begin
 if v_user is null then raise exception 'Unauthorized' using errcode='28000'; end if;
 if not p_create and not exists(select 1 from public.jobs where id=v_id and created_by=v_user) then raise exception 'Job not found or read-only' using errcode='P0002'; end if;
 v_company := public.resolve_tracking_company(nullif(p_data->>'company_id','')::uuid,p_data->>'company');
 select name into v_name from public.companies where id=v_company;
 if p_create then
  insert into public.jobs(id,created_by,company_id,company,title,location,description,type,source,url,deadline)
  values(v_id,v_user,v_company,v_name,btrim(p_data->>'title'),coalesce(p_data->>'location',''),coalesce(p_data->>'description',''),coalesce(p_data->>'type','Internship'),coalesce(p_data->>'source','Manual entry'),coalesce(p_data->>'url',''),nullif(p_data->>'deadline','')::date)
  on conflict do nothing returning id into v_result;
  if v_result is null then
   select id into v_result from public.jobs where created_by=v_user and company_id=v_company and lower(btrim(title))=lower(btrim(p_data->>'title')) and lower(btrim(location))=lower(btrim(coalesce(p_data->>'location',''))) and url=coalesce(p_data->>'url','');
   if v_result is null then raise exception 'Job already exists' using errcode='23505'; end if;
  end if;
 else
  update public.jobs set company_id=v_company,company=v_name,title=btrim(p_data->>'title'),location=coalesce(p_data->>'location',''),description=coalesce(p_data->>'description',''),type=coalesce(p_data->>'type','Internship'),source=coalesce(p_data->>'source','Manual entry'),url=coalesce(p_data->>'url',''),deadline=nullif(p_data->>'deadline','')::date where id=v_id and created_by=v_user returning id into v_result;
 end if;
 return v_result;
end $$;

create function public.save_tracking_application(p_data jsonb, p_create boolean) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_user uuid := auth.uid(); v_id uuid := (p_data->>'id')::uuid; v_job uuid; v_company uuid; v_attempt integer; v_name text; v_existing public.applications;
begin
 if v_user is null then raise exception 'Unauthorized' using errcode='28000'; end if;
 if not p_create then
  select * into v_existing from public.applications where id=v_id and user_id=v_user for update;
  if not found then raise exception 'Application not found' using errcode='P0002'; end if;
  v_job := v_existing.job_id;
 else
  v_job := nullif(p_data->>'job_id','')::uuid;
  if v_job is not null and not exists(select 1 from public.jobs where id=v_job) then raise exception 'Job not found' using errcode='P0002'; end if;
  if v_job is null then v_job := public.save_tracking_job(p_data,true); end if;
 end if;
 v_company := public.resolve_tracking_company(nullif(p_data->>'company_id','')::uuid,p_data->>'company');
 select name into v_name from public.companies where id=v_company;
 if p_create then
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||v_job::text,0));
  if exists(select 1 from public.applications where user_id=v_user and job_id is null
    and lower(btrim(company))=lower(btrim(v_name)) and lower(btrim(title))=lower(btrim(p_data->>'title'))
    and lower(btrim(location))=lower(btrim(coalesce(p_data->>'location',''))) and url=coalesce(p_data->>'url','')
    and status not in ('Rejected','Withdrawn')) then
   raise exception 'An active legacy application already exists for this job' using errcode='23505';
  end if;
  if exists(select 1 from public.applications where user_id=v_user and job_id=v_job and status not in ('Rejected','Withdrawn')) then
   raise exception 'An active application already exists for this job' using errcode='23505';
  end if;
  select coalesce(max(attempt),0)+1 into v_attempt from public.applications where user_id=v_user and job_id=v_job;
  insert into public.applications(id,user_id,job_id,company_id,company,title,location,description,type,source,url,deadline,important_date,status,notes,applied_on,attempt)
  values(v_id,v_user,v_job,v_company,v_name,btrim(p_data->>'title'),coalesce(p_data->>'location',''),coalesce(p_data->>'description',''),coalesce(p_data->>'type','Internship'),coalesce(p_data->>'source','Manual entry'),coalesce(p_data->>'url',''),coalesce(p_data->>'deadline',''),coalesce(p_data->>'important_date',''),(p_data->>'status')::public.application_status,coalesce(p_data->>'notes',''),nullif(p_data->>'applied_on','')::date,v_attempt);
  insert into public.user_jobs(user_id,job_id) values(v_user,v_job) on conflict(user_id,job_id) do nothing;
 else
  update public.applications set company_id=v_company,company=v_name,title=btrim(p_data->>'title'),location=coalesce(p_data->>'location',''),description=coalesce(p_data->>'description',''),type=coalesce(p_data->>'type','Internship'),source=coalesce(p_data->>'source','Manual entry'),url=coalesce(p_data->>'url',''),deadline=coalesce(p_data->>'deadline',''),important_date=coalesce(p_data->>'important_date',''),status=(p_data->>'status')::public.application_status,notes=coalesce(p_data->>'notes',''),applied_on=nullif(p_data->>'applied_on','')::date where id=v_id and user_id=v_user;
 end if;
 return v_id;
end $$;

revoke all on function public.resolve_tracking_company(uuid,text) from public;
revoke all on function public.save_tracking_job(jsonb,boolean) from public;
revoke all on function public.save_tracking_application(jsonb,boolean) from public;
grant execute on function public.resolve_tracking_company(uuid,text) to authenticated;
grant execute on function public.save_tracking_job(jsonb,boolean) to authenticated;
grant execute on function public.save_tracking_application(jsonb,boolean) to authenticated;
revoke all on function public.check_tracking_links() from public;
-- Existing event trigger remains the only writer of application history.
revoke all on function public.log_application_change() from public;
notify pgrst, 'reload schema';
commit;
