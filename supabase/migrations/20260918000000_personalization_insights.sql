-- Personalization inputs and user-confirmed insight actions.

create table public.weight_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weight_kg numeric not null check (weight_kg > 0),
  measured_at timestamptz not null default now(),
  created_at timestamptz default now()
);

create index idx_weight_check_ins_user_time
  on public.weight_check_ins (user_id, measured_at desc);

create table public.weekly_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  flag_type text not null check (flag_type in (
    'plateau', 'overtraining_risk', 'dropout_risk', 'track_promotion', 'nutrition_drift'
  )),
  track_type text check (track_type in ('strength', 'cardio')),
  promoted_track text check (promoted_track in ('beginner', 'intermediate', 'advanced')),
  reason text not null,
  suggested_action text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index weekly_insights_idempotency_idx
  on public.weekly_insights (user_id, week_start, flag_type, suggested_action);
create index idx_weekly_insights_user_unresolved
  on public.weekly_insights (user_id, resolved, week_start desc);

alter table public.weight_check_ins enable row level security;
alter table public.weekly_insights enable row level security;

create policy "Users manage own weight check-ins" on public.weight_check_ins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users read and resolve own insights" on public.weekly_insights
  for select using (auth.uid() = user_id);
create policy "Users resolve own insights" on public.weekly_insights
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Schedule the Edge Function from the Supabase SQL editor after replacing the project URL.
-- Store the service-role key in Vault before running the schedule command:
-- select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
-- select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
-- select cron.schedule(
--   'weekly-personalization-engine',
--   '0 0 * * 0',
--   $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
--       || '/functions/v1/weekly-personalization-engine',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );