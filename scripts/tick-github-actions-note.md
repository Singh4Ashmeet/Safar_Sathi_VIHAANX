# GitHub Actions Backup Ticker Note (Dev A -> Dev C)

## Purpose
Render free web services spin down after 15 minutes of zero inbound traffic. Furthermore, Supabase free PostgreSQL pauses after 1 week of inactivity.

To ensure SafarSaathi's watchdog and dead-man's-switch escalations (FR-05) fire reliably without paid infrastructure:

1. **Primary Ticker**: A free external cron job configured on `cron-job.org` calling `POST /internal/tick` every **1 minute**.
2. **Secondary/Backup Ticker**: A scheduled GitHub Actions workflow (`.github/workflows/tick.yml`) running every **5 minutes** (`*/5 * * * *`).

GitHub Actions scheduled triggers can sometimes experience queue jitter (typically a few minutes). Therefore, `cron-job.org` serves as the primary clock, while GitHub Actions ensures that even if `cron-job.org` experiences downtime, the watchdog will be ticked and the Render instance kept warm.

## Secrets Required in GitHub Repository
- `API_BASE_URL`: Deployed backend URL (e.g., `https://safarsaathi-api.onrender.com`)
- `TICK_SECRET`: The shared secret configured in the backend environment as `TICK_SECRET`

## Hand-off to Dev C
As specified in TRD section 15.2, Dev C owns `.github/**`. This workflow file is provided ready for Dev C to merge into the repository CI configuration.

