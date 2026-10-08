-- Core Campus Fit data model. Personalization tables are added by the next migration.

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

create table public.log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  logged_at timestamptz not null default now(),
  activity_family text not null check (activity_family in ('strength', 'cardio')),
  activity_type text not null,
  duration_min numeric not null check (duration_min > 0),
  perceived_effort int not null check (perceived_effort between 1 and 10),
  heart_rate_avg int,
  hr_zone int check (hr_zone between 1 and 5),
  notes text,
  activity_points numeric not null,
  created_at timestamptz default now()
);

create table public.strength_details (
  id uuid primary key default gen_random_uuid(),
  log_entry_id uuid not null references public.log_entries(id) on delete cascade,
  exercise_name text not null,
  sets int not null,
  reps int not null,
  weight_kg numeric default 0,
  rpe_per_set numeric
);

create table public.cardio_details (
  id uuid primary key default gen_random_uuid(),
  log_entry_id uuid not null references public.log_entries(id) on delete cascade,
  distance_km numeric,
  avg_pace_min_per_km numeric,
  elevation_gain_m numeric
);

create index idx_log_entries_user_time on public.log_entries (user_id, logged_at desc);
create index idx_log_entries_logged_at on public.log_entries (logged_at desc);

alter table public.profiles enable row level security;
alter table public.log_entries enable row level security;
alter table public.strength_details enable row level security;
alter table public.cardio_details enable row level security;

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

create view public.weekly_activity_points as
select
  user_id,
  date_trunc('week', logged_at) as week_start,
  sum(activity_points) as total_points,
  count(*) as session_count
from public.log_entries
group by user_id, date_trunc('week', logged_at);
