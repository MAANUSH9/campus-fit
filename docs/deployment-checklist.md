# Production Deployment Checklist

## GitHub and Vercel

1. Create a private GitHub repository and push this workspace.
2. In Vercel, import the repository as a new project using the Next.js preset.
3. Add these Vercel environment variables for Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Never add `SUPABASE_SERVICE_ROLE_KEY` as a `NEXT_PUBLIC_*` variable. The weekly personalization Edge Function reads its service-role secret from Supabase Edge Function secrets.

## Supabase Auth

In Supabase Dashboard, open **Authentication > URL Configuration** and set:

- Site URL: the Vercel production URL.
- Redirect URLs: the production URL and the exact auth callback path used by the app.
- For preview deployments, add `https://*.vercel.app/**` only if preview auth is required.

Verify the callback URL matches the URL passed to `redirectTo`; mismatches can look like silent auth failures.

## Production cron verification

In the production Supabase project, open **Database > Extensions** and confirm `pg_cron` and `pg_net` are enabled. In **SQL Editor**, verify the schedule points to the production project URL:

```sql
select jobid, jobname, schedule, active, command
from cron.job
where jobname = 'weekly-personalization-engine';
```

The command must target `/functions/v1/weekly-personalization-engine` on the production project, not localhost or a development project. Check recent execution status:

```sql
select *
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'weekly-personalization-engine')
order by start_time desc
limit 10;
```

## Smoke test

1. Create two or three test accounts in the production Auth project.
2. Insert test `log_entries` with `logged_at` dates spanning at least three weeks, plus matching detail rows where relevant.
3. Add dated rows to `weight_check_ins` for nutrition trend testing.
4. Manually invoke the deployed Edge Function with the production function URL and service-role authorization from a secure shell. Do not paste the key into the browser or commit it.
5. Confirm `weekly_insights` contains the expected unresolved rows for each test account.
6. Confirm dashboard accept/dismiss actions work and only confirmed track promotions update `profiles`.

## Real-device check

Open the production URL on an actual phone browser and test sign-in, dashboard loading, insight actions, and touch targets on cellular or Wi-Fi. Desktop responsive emulation is not a substitute for this check.