-- ====================================================
-- Migration: RPC pagination params (2026-09-20)
--
-- Adds optional p_limit / p_offset to get_user_sessions_with_gear so the
-- flight log can page server-side. Defaults preserve the old behavior
-- (bounded at 10k) so existing callers keep working.
--
-- NOTE: get_cost_per_flight_hour_ledger already ships p_limit/p_offset with
-- a richer row type (part_category, packs_flown) — deliberately NOT touched
-- here to avoid regressing it.
-- ====================================================

create or replace function public.get_user_sessions_with_gear(
  p_user_id uuid,
  p_session_ids uuid[] default null,
  p_limit integer default null,
  p_offset integer default null
)
returns table (
  id uuid,
  user_id uuid,
  session_type public.session_type,
  flown_on text,
  duration_minutes integer,
  drone_id uuid,
  controller_id uuid,
  goggles_id uuid,
  location_id uuid,
  track_id uuid,
  sim_platform text,
  packs_flown integer,
  crashes integer,
  battery_notes text,
  weather jsonb,
  notes text,
  created_at timestamptz,
  updated_at timestamptz,
  transmitter_name text,
  drone_name text,
  goggles_name text
)
language plpgsql
security definer
set search_path to public
as $function$
begin
  return query
  select
    s.id,
    s.user_id,
    s.session_type,
    s.flown_on,
    s.duration_minutes,
    s.drone_id,
    s.controller_id,
    s.goggles_id,
    s.location_id,
    s.track_id,
    s.sim_platform,
    s.packs_flown,
    s.crashes,
    s.battery_notes,
    s.weather,
    s.notes,
    s.created_at,
    s.updated_at,
    t.name as transmitter_name,
    d.name as drone_name,
    g.name as goggles_name
  from public.sessions s
  left join personal_gear.transmitters t on s.controller_id = t.id
  left join personal_gear.drones d on s.drone_id = d.id
  left join personal_gear.goggles g on s.goggles_id = g.id
  where s.user_id = p_user_id
    and (p_session_ids is null or s.id = any(p_session_ids))
  order by s.flown_on desc
  limit least(coalesce(p_limit, 10000), 10000)
  offset coalesce(p_offset, 0);
end;
$function$;

grant execute on function public.get_user_sessions_with_gear(uuid, uuid[], integer, integer)
  to authenticated;

-- ====================================================
-- End of migration
-- ====================================================
