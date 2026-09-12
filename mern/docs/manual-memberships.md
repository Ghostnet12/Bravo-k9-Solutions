# Client schedules and manual memberships

## Owner setup after deployment

1. In Vercel, set CRON_SECRET to a securely generated random value for Production and redeploy. Never commit that value. The daily job runs at 14:00 UTC and requires the secret as its bearer token.
2. Open People & access → Manual membership renewal → Switch existing plans to manual renewal. This verifies Bravo metadata and customer ownership, then ends automatic renewal at the paid end date. Existing undated lesson grants receive one month of transition access.
3. Confirm the setup warning is gone and no plans are awaiting the switch. Inspect the next cron invocation in Vercel.

## Features

Schedule & print opens actual saved visits filtered by month. Clients use the link on Account; staff use the person or booking card. Requested, confirmed, waitlisted and cancelled visits keep their labels.

New monthly Checkouts are one-time payments. Verified paid webhooks grant exactly one calendar-month term per booking. Duplicate webhooks cannot extend access. Renewal opens seven days before expiry and starts the next term at the previous paid end, or at payment time if expired. Clients select new visits separately. Do not renew informs staff while preserving paid time.

Notifications are in-app, not email, SMS or browser push. The daily job prepares notices the calendar day before expiry and upon expiry. Authenticated visits also repair missed runs. All staff receive client-message badges with individual read receipts.

Account recovery requires owner/admin reauthentication and client identity verification. The private one-use link expires after 30 minutes. Only its hash is stored. A completed reset invalidates the client's existing sessions. Passwords remain hashed and unreadable.

## Verification

Unit checks cover calendar-month boundaries, daylight-saving changes, exclusive expiry and one-time Checkout parameters. Isolated MongoDB integration checks cover schedule access, read receipts, duplicate fulfillment, renewal ownership, reminders and recovery. Chromium and WebKit checks cover mobile/desktop schedules, printing, notifications and hero layout. Tests never move live money.
