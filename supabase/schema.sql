-- StickTime FPV Phase 1 schema
-- Core SaaS foundation: auth profile, subscriptions, logs, fleet, locations, tracks, teams, and strict RLS.

create extension if not exists pgcrypto;

create type public.app_role as enum ('free_user', 'pro_user', 'team_admin');
create type public.subscription_status as enum ('inactive', 'trialing', 'active', 'past_due', 'canceled');
create type public.flight_type as enum ('sim', 'real');
create type public.gear_item_type as enum ('quad', 'transmitter', 'goggles', 'battery', 'other');
create type public.maintenance_severity as enum ('low', 'medium', 'high');

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  callsign text,
  avatar_url text,
  is_private boolean not null default false,
  role public.app_role not null default 'free_user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_key text not null default 'free',
  status public.subscription_status not null default 'inactive',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_role public.app_role not null default 'free_user',
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table public.team_entry_codes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  code text not null unique,
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  name text not null,
  city text,
  country text,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  track_type public.flight_type not null default 'real',
  simulator_platform text,
  layout_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gear_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  name text not null,
  item_type public.gear_item_type not null default 'quad',
  manufacturer text,
  model text,
  serial_number text,
  purchase_date date,
  crash_count integer not null default 0 check (crash_count >= 0),
  total_flight_minutes integer not null default 0 check (total_flight_minutes >= 0),
  maintenance_interval_minutes integer not null default 600 check (maintenance_interval_minutes > 0),
  minutes_since_maintenance integer not null default 0 check (minutes_since_maintenance >= 0),
  notes text,
  retired boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.flight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  flight_type public.flight_type not null,
  flown_at timestamptz not null default now(),
  duration_minutes integer not null check (duration_minutes > 0 and duration_minutes % 5 = 0),
  gear_item_id uuid references public.gear_items(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  track_id uuid references public.tracks(id) on delete set null,
  packs_flown integer not null default 0 check (packs_flown >= 0),
  crashes integer not null default 0 check (crashes >= 0),
  weather jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gear_item_id uuid not null references public.gear_items(id) on delete cascade,
  performed_at timestamptz not null default now(),
  severity public.maintenance_severity not null default 'low',
  reset_service_clock boolean not null default false,
  cost numeric(10, 2),
  details text not null,
  created_at timestamptz not null default now()
);

create table public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index flight_logs_user_flown_idx on public.flight_logs (user_id, flown_at desc);
create index maintenance_logs_user_date_idx on public.maintenance_logs (user_id, performed_at desc);
create index gear_items_user_idx on public.gear_items (user_id);
create index locations_user_idx on public.locations (user_id);
create index tracks_user_idx on public.tracks (user_id);
create index team_members_user_idx on public.team_members (user_id);

create or replace function public.is_team_member(target_team_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_id = target_team_id and tm.user_id = target_user_id
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, callsign, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'callsign',
    'free_user'
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, plan_key, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.flight_logs to authenticated;
grant select, insert, update, delete on public.gear_items to authenticated;
grant select, insert, update, delete on public.maintenance_logs to authenticated;
grant select, insert, update, delete on public.locations to authenticated;
grant select, insert, update, delete on public.tracks to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.team_entry_codes to authenticated;
grant select, insert on public.stripe_webhook_events to authenticated;

grant all on all tables in schema public to service_role;
grant execute on function public.is_team_member(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.flight_logs enable row level security;
alter table public.gear_items enable row level security;
alter table public.maintenance_logs enable row level security;
alter table public.locations enable row level security;
alter table public.tracks enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_entry_codes enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy "profiles_select_self_or_teammate"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.team_members me
    join public.team_members peer on peer.team_id = me.team_id
    where me.user_id = auth.uid() and peer.user_id = profiles.id
  )
);
create policy "profiles_insert_self"
on public.profiles for insert to authenticated
with check (id = auth.uid());
create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "subscriptions_select_own"
on public.subscriptions for select to authenticated
using (user_id = auth.uid());
create policy "subscriptions_insert_own"
on public.subscriptions for insert to authenticated
with check (user_id = auth.uid());
create policy "subscriptions_update_own"
on public.subscriptions for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "flight_logs_owner_or_team"
on public.flight_logs for select to authenticated
using (
  user_id = auth.uid()
  or (team_id is not null and public.is_team_member(team_id, auth.uid()))
);
create policy "flight_logs_insert_owner_or_team_admin"
on public.flight_logs for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    team_id is null
    or public.is_team_member(team_id, auth.uid())
  )
);
create policy "flight_logs_update_owner"
on public.flight_logs for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy "flight_logs_delete_owner"
on public.flight_logs for delete to authenticated
using (user_id = auth.uid());

create policy "gear_items_owner_or_team"
on public.gear_items for select to authenticated
using (
  user_id = auth.uid()
  or (team_id is not null and public.is_team_member(team_id, auth.uid()))
);
create policy "gear_items_insert_owner"
on public.gear_items for insert to authenticated
with check (user_id = auth.uid());
create policy "gear_items_update_owner"
on public.gear_items for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy "gear_items_delete_owner"
on public.gear_items for delete to authenticated
using (user_id = auth.uid());

create policy "maintenance_logs_owner_or_team"
on public.maintenance_logs for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.gear_items g
    where g.id = maintenance_logs.gear_item_id
      and g.team_id is not null
      and public.is_team_member(g.team_id, auth.uid())
  )
);
create policy "maintenance_logs_insert_owner"
on public.maintenance_logs for insert to authenticated
with check (user_id = auth.uid());
create policy "maintenance_logs_update_owner"
on public.maintenance_logs for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy "maintenance_logs_delete_owner"
on public.maintenance_logs for delete to authenticated
using (user_id = auth.uid());

create policy "locations_owner_or_team"
on public.locations for select to authenticated
using (
  user_id = auth.uid()
  or (team_id is not null and public.is_team_member(team_id, auth.uid()))
);
create policy "locations_insert_owner"
on public.locations for insert to authenticated
with check (user_id = auth.uid());
create policy "locations_update_owner"
on public.locations for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy "locations_delete_owner"
on public.locations for delete to authenticated
using (user_id = auth.uid());

create policy "tracks_owner_or_team"
on public.tracks for select to authenticated
using (
  user_id = auth.uid()
  or (team_id is not null and public.is_team_member(team_id, auth.uid()))
);
create policy "tracks_insert_owner"
on public.tracks for insert to authenticated
with check (user_id = auth.uid());
create policy "tracks_update_owner"
on public.tracks for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
create policy "tracks_delete_owner"
on public.tracks for delete to authenticated
using (user_id = auth.uid());

create policy "teams_select_owner_or_member"
on public.teams for select to authenticated
using (
  owner_id = auth.uid() or public.is_team_member(id, auth.uid())
);
create policy "teams_insert_owner_only"
on public.teams for insert to authenticated
with check (
  owner_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('pro_user', 'team_admin'))
);
create policy "teams_update_owner_only"
on public.teams for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
create policy "teams_delete_owner_only"
on public.teams for delete to authenticated
using (owner_id = auth.uid());

create policy "team_members_select_member"
on public.team_members for select to authenticated
using (user_id = auth.uid() or public.is_team_member(team_id, auth.uid()));
create policy "team_members_insert_self"
on public.team_members for insert to authenticated
with check (user_id = auth.uid());
create policy "team_members_delete_self_or_owner"
on public.team_members for delete to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.teams t
    where t.id = team_members.team_id and t.owner_id = auth.uid()
  )
);

create policy "team_entry_codes_select_member"
on public.team_entry_codes for select to authenticated
using (public.is_team_member(team_id, auth.uid()) or created_by = auth.uid());
create policy "team_entry_codes_insert_owner"
on public.team_entry_codes for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.teams t
    where t.id = team_entry_codes.team_id and t.owner_id = auth.uid()
  )
);
create policy "team_entry_codes_delete_owner"
on public.team_entry_codes for delete to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = team_entry_codes.team_id and t.owner_id = auth.uid()
  )
);

create policy "stripe_webhook_events_service_or_owner_read"
on public.stripe_webhook_events for select to authenticated
using (false);
create policy "stripe_webhook_events_insert_blocked_for_clients"
on public.stripe_webhook_events for insert to authenticated
with check (false);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.update_updated_at_column();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.update_updated_at_column();

create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.update_updated_at_column();

create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.update_updated_at_column();

create trigger tracks_set_updated_at
before update on public.tracks
for each row execute function public.update_updated_at_column();

create trigger gear_items_set_updated_at
before update on public.gear_items
for each row execute function public.update_updated_at_column();

create trigger flight_logs_set_updated_at
before update on public.flight_logs
for each row execute function public.update_updated_at_column();

