# Unlucid Gem Manager

A modern, high-performance dashboard for managing multiple Unlucid accounts, tracking gems, and automating claims. Built with React, Vite, and Tailwind CSS.

## Features

- **Multi-Account Dashboard**: View all your accounts in a sleek, responsive grid or masonry layout.
- **Real-time Stats**: Track total gems and ready-to-claim status instantly.
- **Claim**: Claim gems for individual accounts or all eligible accounts with one click.
- **Server Auto-Claim**: Vercel Cron claims ready accounts daily without keeping a browser tab open.
- **Dark/Light Mode**: Fully supported themes with a premium glassmorphism aesthetic.
- **Secure**: Tokens live in env vars; cron is gated by `CRON_SECRET`.

A modern, high-performance dashboard for managing multiple Unlucid accounts, tracking gems, and automating claims. Built with React, Vite, and Tailwind CSS.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/saahiyo/unlucid-manager.git
    cd unlucid-manager
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Configuration

1.  **Environment Variables:**
    This project uses Environment Variables to manage secrets. You do not need a `constants.ts` file.

    **Locally:**
    Create a `.env` file in the root directory:
    ```bash
    cp .env.example .env
    ```
    Open `.env` and paste your cookies JSON string into `VITE_COOKIES`.

    **On Vercel (set once):**
    1. Add **Upstash Redis** from Vercel Storage / Marketplace and connect it to this project (injects `KV_REST_API_URL` + `KV_REST_API_TOKEN`).
    2. Environment variables:
       - `CRON_SECRET` — long random string (cron auth)
       - `VITE_SYNC_SECRET` — **same value** as `CRON_SECRET` (dashboard sync auth)
       - Optional: `VITE_COOKIES` / `UNLUCID_COOKIES` only as a bootstrap fallback

    After that, **Update cookies** in the UI writes to Redis. Daily cron reads Redis — you do not re-edit env when a session expires.

    > `VITE_SYNC_SECRET` is visible in the client bundle; fine for a private personal deploy, not for a public multi-user app.

## Usage

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API proxy

This app ships with an **owned Unlucid proxy** under `/api`:

| Route | Purpose |
|-------|---------|
| `POST /api/account` | Fetch normalized account + claim timer |
| `POST /api/both` | Same as account (compat) |
| `POST /api/claim` | Claim daily free gems |
| `POST /api/batch` | Sync many accounts: `{ accounts: [{ id, cookies }] }` |
| `GET/POST /api/cron/auto-claim` | Server auto-claim (cron / manual); requires `CRON_SECRET` |
| `GET/POST /api/accounts` | Sync account cookies to Redis for cron; requires `SYNC_SECRET`/`CRON_SECRET` |

Locally, Vite middleware serves these routes (cookies sync to `.data/remote-accounts.json` if Upstash is unset). On Vercel, `/api` deploys automatically. Optional `VITE_API_BASE` points at a separately hosted proxy.

### Server auto-claim

`vercel.json` schedules `/api/cron/auto-claim` daily at 08:00 UTC (`0 8 * * *`) for Vercel Hobby. On Pro you can use hourly (`0 * * * *`).

Cron loads accounts from **Upstash Redis** (synced by the dashboard). If Redis is empty, it falls back to `UNLUCID_COOKIES` / `VITE_COOKIES`.

Manual test:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/auto-claim
```

Response includes `claimed`, `skipped`, `failed`, `source` (`remote`|`env`), and per-account `results`.

Normalized response shape:

```json
{
  "ok": true,
  "code": "OK",
  "status": 200,
  "profile": {
    "gems": 48,
    "canClaimFreeGems": false,
    "nextFreeGemsAt": 1730000000000,
    "name": "…",
    "email": "…"
  }
}
```

Error codes: `SESSION_EXPIRED`, `ALREADY_CLAIMED`, `INVALID_REQUEST`, `UPSTREAM_ERROR`, `ERROR`.

## Technologies

- [React](https://reactjs.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide React](https://lucide.dev/)
- [Motion](https://motion.dev/)

## License

MIT
