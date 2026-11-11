-- LOCAL DEVELOPMENT ONLY. Never apply this seed to production.
insert into public.companies(id,name) values ('00000000-0000-4000-8000-000000000101','Example Studio'),('00000000-0000-4000-8000-000000000102','Example Labs');
insert into public.jobs(company_id,company,title,location,type,source,url,deadline) values
('00000000-0000-4000-8000-000000000101','Example Studio','Product Design Intern','New York, NY','Internship','Local seed · sample listing','',current_date+21),
('00000000-0000-4000-8000-000000000102','Example Labs','Software Engineering Intern','Remote','Internship','Local seed · sample listing','',current_date+30);
