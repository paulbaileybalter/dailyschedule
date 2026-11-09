# Balter Brewing — Task Dashboard

A password-protected Cloudflare Worker. Static site in `public/`, API + password gate in `src/worker.js`, your data in Workers KV.

## Deploy: GitHub -> Cloudflare Workers
1. Push this folder to a **private** GitHub repo.
2. Cloudflare dashboard -> **Workers & Pages** -> **Create** -> **Import a repository** -> pick the repo.
3. Build command: **(blank)**. Deploy command: `npx wrangler deploy` (default). Deploy.
4. Worker -> **Settings -> Variables and Secrets** -> add `SITE_PASSWORD` (type **Secret**), and optionally `SESSION_SECRET` (any long random string). Click **Deploy**.
5. Open the site and sign in.

The KV namespace is the `SCHEDULE` binding in `wrangler.jsonc`. Recent Wrangler creates it on first deploy. If not: dashboard -> **Storage & databases -> KV -> Create**, then add `"id": "<namespace id>"` to the `SCHEDULE` entry and push.

## Password (stored in KV)
- `SITE_PASSWORD` is only the **starting** password.
- In the app: gear -> **Change password**. This saves a salted hash in KV (key `auth`), which then takes over; the secret is no longer used and every other signed-in device is signed out.
- Or set it from your computer: `node tools/hash-password.mjs "new password"` and run the command it prints.
- Forgot it? Delete the `auth` key in the KV dashboard and the `SITE_PASSWORD` secret works again.

## Using it
- **Day**: tick tasks, click a task's text to edit it (type a time first, e.g. `1330 Meeting`), `⋯` for *Not needed today*, move, copy, note, colour, delete. Drag the grip handle to reorder, or drop a task on the previous/next-day buttons.
- **Left in the fermenter**: unfinished one-off tasks from the last week are offered on today's page - bring them forward in one click.
- **Week**: Mon-Fri columns like your spreadsheet; drag tasks between days.
- **History**: every week with progress, "Show what I did", and search across the last 40 weeks.
- **Projects** = your Ongoing / Projects column; `+ Day` adds one to the day you're viewing. **Brewer's log** = a notes box per day.
- Gear -> **Edit weekly routine**: the Mon-Fri lists (from your Master tab) that appear automatically the first time you open a day.
- First visit: click **Import history** to bring in the 32 weeks from your spreadsheet (never overwrites existing work).
- Keyboard: `←` `→` change day, `t` jumps to today. Works offline for a while - changes sync when you're back.

## Test locally
    cp .dev.vars.example .dev.vars   # edit the password
    npx wrangler dev

## Updating from the spreadsheet
`python3 tools/build-from-spreadsheet.py PB_Daily_Schedule.xlsx` regenerates `src/defaults.js` and `public/data/history.json`.

## KV notes
One entry per week (`wk:<Monday>`), plus `config` and `auth`. Nothing expires. Free plan: 1,000 writes/day (changes are batched, a normal day is well under 100).
