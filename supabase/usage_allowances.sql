-- Claude usage tracking and monthly allowances for Forma.
-- Applied to content-intake's Supabase project (section_gen schema) on 2026-11-24.
-- Everything is additive: it adds tables and functions to section_gen and changes nothing else.
--
-- The app has no service-role key: the API routes call these functions with the signed-in
-- person's token. So members can only add usage to themselves and read their own totals,
-- and only admins (section_gen.user_roles.role = 'admin') can change roles, allowances,
-- requests and settings, or read everyone's usage.

-- Monthly allowance per role, in USD. null = no limit.
create table if not exists section_gen.role_allowances (
  role text primary key,
  monthly_usd numeric check (monthly_usd is null or monthly_usd >= 0),
  description text not null default ''
);
insert into section_gen.role_allowances (role, monthly_usd, description) values
  ('creator', 10, 'Creator / Marketing: generate, refine and compare'),
  ('designer', 20, 'Designer: advanced generation and visual review'),
  ('developer', 20, 'Web Developer: code refinement, debugging and QA'),
  ('reviewer', 3, 'Reviewer: review assistance and summaries'),
  ('admin', null, 'Administrator: sets budgets and approves extra usage')
on conflict (role) do nothing;

-- Role per person, by email (so admins can set it before someone first signs in).
-- monthly_usd overrides the role's allowance when set. People not listed are creators.
create table if not exists section_gen.user_roles (
  email text primary key check (email = lower(email)),
  role text not null default 'creator' references section_gen.role_allowances (role) on update cascade,
  monthly_usd numeric check (monthly_usd is null or monthly_usd >= 0),
  updated_at timestamptz not null default now()
);
-- Mahesh's test account is the first admin.
insert into section_gen.user_roles (email, role) values ('superadmin@gmail.com', 'admin') on conflict (email) do nothing;

-- One row of team-wide settings.
create table if not exists section_gen.budget_settings (
  id boolean primary key default true check (id),
  team_monthly_usd numeric not null default 200,
  warn_at numeric[] not null default '{0.7,0.9}',
  updated_at timestamptz not null default now()
);
insert into section_gen.budget_settings (id) values (true) on conflict (id) do nothing;

-- One row per Claude API call, from the usage the API returned.
create table if not exists section_gen.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  email text not null,
  project_id text,
  section_id text,
  label text not null,
  model text not null,
  premium boolean not null default false,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cost_usd numeric not null default 0 check (cost_usd >= 0),
  cache_savings_usd numeric not null default 0 check (cache_savings_usd >= 0),
  created_at timestamptz not null default now()
);
create index if not exists usage_events_user_month on section_gen.usage_events (user_id, created_at);
create index if not exists usage_events_created on section_gen.usage_events (created_at);

-- Requests for more allowance. An approved amount adds to that person's limit for that month.
create table if not exists section_gen.allowance_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  email text not null,
  month date not null default date_trunc('month', now())::date,
  amount_usd numeric not null check (amount_usd > 0),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  approved_usd numeric check (approved_usd is null or approved_usd >= 0),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists allowance_requests_user_month on section_gen.allowance_requests (user_id, month);

alter table section_gen.role_allowances enable row level security;
alter table section_gen.user_roles enable row level security;
alter table section_gen.budget_settings enable row level security;
alter table section_gen.usage_events enable row level security;
alter table section_gen.allowance_requests enable row level security;

create or replace function section_gen.my_email() returns text
language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function section_gen.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select section_gen.is_member() and exists (
    select 1 from section_gen.user_roles r where r.email = section_gen.my_email() and r.role = 'admin'
  );
$$;

-- Policies: members read the role table and settings; admins write them and read all usage.
drop policy if exists "members read" on section_gen.role_allowances;
create policy "members read" on section_gen.role_allowances for select to authenticated using (section_gen.is_member());
drop policy if exists "admins write" on section_gen.role_allowances;
create policy "admins write" on section_gen.role_allowances for all to authenticated using (section_gen.is_admin()) with check (section_gen.is_admin());

drop policy if exists "own or admin read" on section_gen.user_roles;
create policy "own or admin read" on section_gen.user_roles for select to authenticated using (email = section_gen.my_email() or section_gen.is_admin());
drop policy if exists "admins write" on section_gen.user_roles;
create policy "admins write" on section_gen.user_roles for all to authenticated using (section_gen.is_admin()) with check (section_gen.is_admin());

drop policy if exists "members read" on section_gen.budget_settings;
create policy "members read" on section_gen.budget_settings for select to authenticated using (section_gen.is_member());
drop policy if exists "admins write" on section_gen.budget_settings;
create policy "admins write" on section_gen.budget_settings for update to authenticated using (section_gen.is_admin()) with check (section_gen.is_admin());

-- Usage rows are only added through record_usage(); nobody can edit or delete them.
drop policy if exists "own or admin read" on section_gen.usage_events;
create policy "own or admin read" on section_gen.usage_events for select to authenticated using (user_id = auth.uid() or section_gen.is_admin());

-- Requests are created through request_more() and decided through decide_request().
drop policy if exists "own or admin read" on section_gen.allowance_requests;
create policy "own or admin read" on section_gen.allowance_requests for select to authenticated using (user_id = auth.uid() or section_gen.is_admin());

-- The caller's allowance for the current month.
create or replace function section_gen.my_allowance() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me text := section_gen.my_email();
  r record;
  base numeric;
  extra numeric;
  spent numeric;
  pending numeric;
  month_start timestamptz := date_trunc('month', now());
  warn numeric[];
begin
  if not section_gen.is_member() then
    raise exception 'not a member';
  end if;
  select coalesce(u.role, 'creator') as role, u.monthly_usd as override into r
    from (select 1) one left join section_gen.user_roles u on u.email = me;
  select coalesce(r.override, a.monthly_usd) into base from section_gen.role_allowances a where a.role = r.role;
  if r.override is null and not exists (select 1 from section_gen.role_allowances a where a.role = r.role) then
    base := 0;
  end if;
  select coalesce(sum(q.approved_usd), 0) into extra from section_gen.allowance_requests q
    where q.user_id = auth.uid() and q.month = month_start::date and q.status = 'approved';
  select coalesce(sum(q.amount_usd), 0) into pending from section_gen.allowance_requests q
    where q.user_id = auth.uid() and q.month = month_start::date and q.status = 'pending';
  select coalesce(sum(e.cost_usd), 0) into spent from section_gen.usage_events e
    where e.user_id = auth.uid() and e.created_at >= month_start;
  select s.warn_at into warn from section_gen.budget_settings s where s.id;
  return jsonb_build_object(
    'role', r.role,
    'limit_usd', case when base is null then null else base + extra end,
    'base_usd', base,
    'extra_usd', extra,
    'pending_usd', pending,
    'spent_usd', spent,
    'warn_at', to_jsonb(coalesce(warn, '{0.7,0.9}')),
    'month', month_start::date
  );
end;
$$;

-- Adds one Claude call to the caller's usage.
create or replace function section_gen.record_usage(
  p_label text, p_model text, p_project_id text, p_section_id text, p_premium boolean,
  p_input integer, p_output integer, p_cache_read integer, p_cache_write integer,
  p_cost numeric, p_savings numeric
) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not section_gen.is_member() then
    raise exception 'not a member';
  end if;
  insert into section_gen.usage_events (user_id, email, project_id, section_id, label, model, premium,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, cache_savings_usd)
  values (auth.uid(), section_gen.my_email(), p_project_id, p_section_id, left(p_label, 80), left(p_model, 80), coalesce(p_premium, false),
    greatest(p_input, 0), greatest(p_output, 0), greatest(p_cache_read, 0), greatest(p_cache_write, 0),
    greatest(coalesce(p_cost, 0), 0), greatest(coalesce(p_savings, 0), 0));
end;
$$;

-- Asks an admin for more allowance this month.
create or replace function section_gen.request_more(p_amount numeric, p_note text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not section_gen.is_member() then
    raise exception 'not a member';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000 then
    raise exception 'amount must be between 0 and 1000';
  end if;
  if exists (select 1 from section_gen.allowance_requests q where q.user_id = auth.uid() and q.status = 'pending'
             and q.month = date_trunc('month', now())::date) then
    raise exception 'you already have a pending request';
  end if;
  insert into section_gen.allowance_requests (user_id, email, amount_usd, note)
  values (auth.uid(), section_gen.my_email(), p_amount, left(coalesce(p_note, ''), 500));
end;
$$;

-- Admin: approve (optionally a different amount) or decline a request.
create or replace function section_gen.decide_request(p_id bigint, p_approve boolean, p_amount numeric default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not section_gen.is_admin() then
    raise exception 'admins only';
  end if;
  update section_gen.allowance_requests q set
    status = case when p_approve then 'approved' else 'declined' end,
    approved_usd = case when p_approve then greatest(coalesce(p_amount, q.amount_usd), 0) else null end,
    decided_by = section_gen.my_email(),
    decided_at = now()
  where q.id = p_id and q.status = 'pending';
end;
$$;

-- Admin: per-person totals for a month, with each person's limit.
create or replace function section_gen.usage_by_person(p_month date default date_trunc('month', now())::date) returns table (
  email text, role text, limit_usd numeric, spent_usd numeric, calls bigint, premium_usd numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not section_gen.is_admin() then
    raise exception 'admins only';
  end if;
  return query
  with people as (
    select e.email from section_gen.usage_events e where e.created_at >= p_month and e.created_at < (p_month + interval '1 month')
    union select u.email from section_gen.user_roles u
  ),
  spend as (
    select e.email, sum(e.cost_usd) as spent, count(*) as calls, sum(case when e.premium then e.cost_usd else 0 end) as prem
    from section_gen.usage_events e
    where e.created_at >= p_month and e.created_at < (p_month + interval '1 month')
    group by e.email
  ),
  extra as (
    select q.email, sum(q.approved_usd) as extra from section_gen.allowance_requests q
    where q.month = p_month and q.status = 'approved' group by q.email
  )
  select p.email, coalesce(u.role, 'creator'),
    -- null = no limit (a role whose allowance is null, such as admin, and no personal override)
    case when u.monthly_usd is null and a.role is not null and a.monthly_usd is null then null
         else coalesce(u.monthly_usd, a.monthly_usd, 0) + coalesce(x.extra, 0) end,
    coalesce(s.spent, 0), coalesce(s.calls, 0), coalesce(s.prem, 0)
  from people p
  left join section_gen.user_roles u on u.email = p.email
  left join section_gen.role_allowances a on a.role = coalesce(u.role, 'creator')
  left join spend s on s.email = p.email
  left join extra x on x.email = p.email
  order by coalesce(s.spent, 0) desc;
end;
$$;

grant usage on schema section_gen to authenticated;
grant select on section_gen.role_allowances, section_gen.user_roles, section_gen.budget_settings, section_gen.usage_events, section_gen.allowance_requests to authenticated;
grant insert, update, delete on section_gen.role_allowances, section_gen.user_roles to authenticated;
grant update on section_gen.budget_settings to authenticated;
revoke all on function section_gen.my_allowance(), section_gen.record_usage(text, text, text, text, boolean, integer, integer, integer, integer, numeric, numeric),
  section_gen.request_more(numeric, text), section_gen.decide_request(bigint, boolean, numeric), section_gen.usage_by_person(date), section_gen.is_admin() from public, anon;
grant execute on function section_gen.my_allowance(), section_gen.record_usage(text, text, text, text, boolean, integer, integer, integer, integer, numeric, numeric),
  section_gen.request_more(numeric, text), section_gen.decide_request(bigint, boolean, numeric), section_gen.usage_by_person(date), section_gen.is_admin() to authenticated;
