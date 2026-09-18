-- Campus Fitness App — Supabase (Postgres) schema
-- Mirrors the Unified Activity Logging design from the quiz logic doc.
-- Run this in the Supabase SQL editor after creating a new project.

-- Users are handled by Supabase Auth (auth.users). This table extends with app-specific profile data.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  height_cm numeric not null,
  weight_kg numeric not null,
  age int not null,
  sex text not null check (sex in ('male', 'female')),
  activity_level text not null check (activity_level in ('sedentary', 'light', 'moderate', 'very_active')),
  body_fat_percent numeric not null,
  body_fat_source text not null check (body_fat_source in ('measured', 'visual_estimate', 'navy_method')),
  goal text not null check (goal in ('fat_loss', 'lean_bulk', 'recomposition', 'maintenance')),
  training_age_years numeric default 0,
  strength_track text check (strength_track in ('beginner', 'intermediate', 'advanced')),
  cardio_track text check (cardio_track in ('beginner', 'intermediate', 'advanced')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Dated measurements support six-week weight trend comparisons without mutating profile state.
create table public.weight_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weight_kg numeric not null check (weight_kg > 0),
  measured_at timestamptz not null default now(),
  created_at timestamptz default now()
);

-- One row per logged session. activity_points is computed app-side (lib/calculations.ts)
-- and stored here so leaderboard queries never need to recompute it on read.
create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  logged_at timestamptz not null default now(),
  activity_family text not null check (activity_family in ('strength', 'cardio')),
  activity_type text not null, -- 'calisthenics' | 'gym' | 'walking' | 'running' | 'cycling' | 'other'
  duration_min numeric not null check (duration_min > 0),
  perceived_effort int not null check (perceived_effort between 1 and 10),
  heart_rate_avg int,
  hr_zone int check (hr_zone between 1 and 5),
  notes text,
  activity_points numeric not null,
  created_at timestamptz default now()
);

-- Strength-specific detail, one row per exercise per log_entry
create table public.strength_details (
  id uuid primary key default gen_random_uuid(),
  log_entry_id uuid not null references public.log_entries(id) on delete cascade,
  exercise_name text not null,
  sets int not null,
  reps int not null,
  weight_kg numeric default 0, -- 0 for pure bodyweight
  rpe_per_set numeric
);

-- Cardio-specific detail, one row per log_entry
create table public.cardio_details (
  id uuid primary key default gen_random_uuid(),
  log_entry_id uuid not null references public.log_entries(id) on delete cascade,
  distance_km numeric,
  avg_pace_min_per_km numeric,
  elevation_gain_m numeric
);

-- Rule-based weekly suggestions. Users resolve these in the dashboard; the engine never mutates profiles.
create table public.weekly_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  flag_type text not null check (flag_type in ('plateau', 'overtraining_risk', 'dropout_risk', 'track_promotion', 'nutrition_drift')),
  track_type text check (track_type in ('strength', 'cardio')),
  promoted_track text check (promoted_track in ('beginner', 'intermediate', 'advanced')),
  reason text not null,
  suggested_action text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index weekly_insights_idempotency_idx
  on public.weekly_insights (user_id, week_start, flag_type, suggested_action);
create index idx_weight_check_ins_user_time on public.weight_check_ins (user_id, measured_at desc);
create index idx_weekly_insights_user_unresolved on public.weekly_insights (user_id, resolved, week_start desc);

-- Indexes for the two query patterns that matter most: a user's own history, and weekly leaderboards
create index idx_log_entries_user_time on public.log_entries (user_id, logged_at desc);
create index idx_log_entries_logged_at on public.log_entries (logged_at desc);

-- Row Level Security: users can only read/write their own data.
-- (Leaderboard aggregates will be served via a Postgres view/function with security definer, not direct table access.)
alter table public.profiles enable row level security;
alter table public.log_entries enable row level security;
alter table public.strength_details enable row level security;
alter table public.cardio_details enable row level security;
alter table public.weight_check_ins enable row level security;
alter table public.weekly_insights enable row level security;

create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = id);

create policy "Users manage own log entries" on public.log_entries
  for all using (auth.uid() = user_id);

create policy "Users manage own strength details" on public.strength_details
  for all using (
    auth.uid() = (select user_id from public.log_entries where id = log_entry_id)
  );

create policy "Users manage own cardio details" on public.cardio_details
  for all using (
    auth.uid() = (select user_id from public.log_entries where id = log_entry_id)
  );

create policy "Users manage own weight check-ins" on public.weight_check_ins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users read and resolve own insights" on public.weekly_insights
  for select using (auth.uid() = user_id);
create policy "Users resolve own insights" on public.weekly_insights
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Weekly points view, ready for the future community/leaderboard layer.
-- Kept as a plain view (not exposed to RLS-restricted users directly) for later use
-- once the community layer decides what's shared vs private.
create view public.weekly_activity_points as
select
  user_id,
  date_trunc('week', logged_at) as week_start,
  sum(activity_points) as total_points,
  count(*) as session_count
from public.log_entries
group by user_id, date_trunc('week', logged_at);
