-- Incremental: preserves existing tables, history and manual application behavior.
begin;
alter table public.applications add column source_status text not null default '' check(length(source_status)<=120);
create table public.application_import_receipts (
 user_id uuid not null references auth.users(id) on delete cascade,
 import_key text not null check(import_key ~ '^[a-f0-9]{64}:[0-9]+:[0-9]+$'),
 application_id uuid not null references public.applications(id) on delete cascade,
 primary key(user_id,import_key)
);
alter table public.application_import_receipts enable row level security;
create policy receipt_owner on public.application_import_receipts for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.applications a where a.id=application_id and a.user_id=(select auth.uid())));
-- Each RPC is one atomic row transaction, including company, job, bookmark, event and receipt.
create function public.import_tracking_application(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_job uuid; v_company uuid; v_data jsonb; v_key text:=p_data->>'import_key'; v_status public.application_status;
begin
 if v_user is null then raise exception 'Unauthorized' using errcode='28000'; end if;
 if v_key is null or v_key !~ '^[a-f0-9]{64}:[0-9]+:[0-9]+$' or p_data->>'reviewed' is distinct from 'true'
 or length(btrim(coalesce(p_data->>'company',''))) not between 1 and 120
 or length(btrim(coalesce(p_data->>'title',''))) not between 1 and 160
 or length(coalesce(p_data->>'location',''))>160 or length(coalesce(p_data->>'source_status',''))>120
 or coalesce(p_data->>'type','') not in ('Internship','Co-op','Graduate')
 or coalesce(p_data->>'applied_on','') !~ '^\d{4}-\d{2}-\d{2}$' then
  raise exception 'Review company, title, date, type and status before importing' using errcode='22023';
 end if;
 perform (p_data->>'applied_on')::date;
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
 and (a.applied_on=(p_data->>'applied_on')::date or a.status not in ('Rejected','Withdrawn'))
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
revoke all on function public.import_tracking_application(jsonb) from public;
grant execute on function public.import_tracking_application(jsonb) to authenticated;
grant select,insert,update,delete on public.application_import_receipts to authenticated;
notify pgrst,'reload schema';
commit;
