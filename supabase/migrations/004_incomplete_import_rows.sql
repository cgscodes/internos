-- Preserve nullable dates and represent missing employment type without guessing.
-- Existing caller privileges, RLS policies and history triggers remain in force.
begin;
alter table public.jobs drop constraint jobs_type_check;
alter table public.jobs add constraint jobs_type_check check(type in ('Internship','Co-op','Graduate','Unknown'));
alter table public.applications drop constraint applications_type_check;
alter table public.applications add constraint applications_type_check check(type in ('Internship','Co-op','Graduate','Unknown'));
-- Keep unknown Handshake dates unknown on inserts and later status changes.
create or replace function public.check_tracking_links() returns trigger language plpgsql security invoker set search_path='' as $$
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
  if new.source <> 'Handshake' and new.applied_on is null and new.status in ('Applied','Assessment','Interview','Offer','Rejected','Withdrawn') then
   if tg_op='INSERT' or old.status in ('Saved','Preparing','Ready') then new.applied_on=current_date; end if;
  end if;
 elsif tg_table_name='user_jobs' then
  if not exists(select 1 from public.jobs j where j.id=new.job_id and (j.created_by is null or j.created_by=new.user_id)) then
   raise exception 'Job is not accessible' using errcode='23503';
  end if;
 end if;
 return new;
end $$;

create or replace function public.import_tracking_application(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_job uuid; v_company uuid; v_data jsonb; v_key text:=p_data->>'import_key'; v_status public.application_status;
begin
 if v_user is null then raise exception 'Unauthorized' using errcode='28000'; end if;
 if v_key is null or v_key !~ '^[a-f0-9]{64}:[0-9]+:[0-9]+$' or p_data->>'reviewed' is distinct from 'true'
 or length(btrim(coalesce(p_data->>'company',''))) not between 1 and 120
 or length(btrim(coalesce(p_data->>'title',''))) not between 1 and 160
 or length(coalesce(p_data->>'location',''))>160 or length(coalesce(p_data->>'source_status',''))>120
 or coalesce(p_data->>'type','') not in ('Internship','Co-op','Graduate','Unknown')
 or (nullif(p_data->>'applied_on','') is not null and p_data->>'applied_on' !~ '^\d{4}-\d{2}-\d{2}$') then
  raise exception 'Review company, title, date, type and status before importing' using errcode='22023';
 end if;
 perform nullif(p_data->>'applied_on','')::date;
 v_status:=(p_data->>'status')::public.application_status;
 if v_status is null then raise exception 'Status required' using errcode='22023'; end if;
 -- Serialize imports for this user, including equivalent rows from different PDF exports.
 perform pg_advisory_xact_lock(hashtextextended(v_user::text||':pdf-import',0));
 select application_id into v_id from public.application_import_receipts where user_id=v_user and import_key=v_key;
 if v_id is not null then return jsonb_build_object('id',v_id,'outcome','duplicate'); end if;
 v_job:=nullif(p_data->>'job_id','')::uuid;
 if v_job is not null then
  select company_id into v_company from public.jobs where id=v_job;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
 end if;
 select a.id into v_id from public.applications a where a.user_id=v_user
 and ((v_job is not null and a.job_id=v_job) or (v_job is null
 and lower(btrim(a.company))=lower(btrim(p_data->>'company'))
 and lower(btrim(a.title))=lower(btrim(p_data->>'title'))
 and lower(btrim(a.location))=lower(btrim(coalesce(p_data->>'location','')))))
 and (a.applied_on is not distinct from nullif(p_data->>'applied_on','')::date or a.status not in ('Rejected','Withdrawn'))
 order by a.created_at limit 1;
 if v_id is not null then
  insert into public.application_import_receipts values(v_user,v_key,v_id);
  return jsonb_build_object('id',v_id,'outcome','duplicate');
 end if;
 v_data:=p_data || jsonb_build_object('id',gen_random_uuid(),'source','Handshake','company_id',v_company,'url','','description','','notes','','deadline','','important_date','');
 if v_job is not null then
  select v_data || jsonb_build_object('company',company,'company_id',company_id,'title',title,'location',location,'url',url,'type',type) into v_data from public.jobs where id=v_job;
 end if;
 v_id:=public.save_tracking_application(v_data,true);
 update public.applications set source_status=coalesce(p_data->>'source_status','') where id=v_id and user_id=v_user;
 insert into public.application_import_receipts values(v_user,v_key,v_id);
 return jsonb_build_object('id',v_id,'outcome','created');
end $$;
notify pgrst,'reload schema';
commit;
