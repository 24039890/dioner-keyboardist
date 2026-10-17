# DIONER backend (Python / FastAPI)

The DIONER Keyboardist app uses this server for **video tutorial search**. It proxies the YouTube Data API v3, so the
API key stays on the server and never ships inside the mobile app. Accounts, user data and recordings stay in Supabase;
this service stores nothing about users.

## Why Python

- The music and audio ecosystem (librosa, music21, NumPy) suits future server-side analysis.
- FastAPI gives typed, validated endpoints with OpenAPI docs built in.
- It is far lighter to run and maintain than a Java service for this scope.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | `{status, version, youtube: configured \| not-configured}` |
| GET | `/v1/videos/categories` | Curated tutorial categories aligned with the app's lessons |
| GET | `/v1/videos/search?q=&category=&difficulty=&pageToken=` | Up to 12 embeddable videos (safe search forced) |
| GET | `/docs` | Interactive OpenAPI docs |

Errors are JSON `{reason, message}`:

| Status | `reason` | Meaning |
| --- | --- | --- |
| 400 | `invalid-request` | The search request is malformed |
| 429 | `rate-limited` | Too many requests from this client |
| 502 | `network` | YouTube could not be reached |
| 503 | `provider-error` | YouTube refused the request (quota, bad key) |
| 503 | `not-configured` | No API key is set |

## Protections

- **Quota caching.** Results are cached in memory for 6 hours, keyed by normalised query, category, difficulty and
  page. A YouTube search costs 100 quota units and the default daily quota is 10,000.
- **Rate limiting.** 30 requests per minute per client, configurable. Behind a proxy, set `TRUST_PROXY=true` so the
  limit is per real client IP.
- **Input cleaning.** Query text is trimmed, length-limited and stripped of special characters.
- **Safe results.** `safeSearch=strict` and `videoEmbeddable=true` are always sent.
- **Locked-down defaults.** CORS is limited to `ALLOWED_ORIGINS` and only GET is allowed. The container runs as a
  non-root user.

## Run locally

```bash
python -m venv .venv
```

```bash
.venv\Scripts\python -m pip install -r requirements-dev.txt
```

Copy `.env.example` to `.env` and set `YOUTUBE_API_KEY`, then start the server:

```bash
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

To use it from the phone, set `EXPO_PUBLIC_API_URL=http://<your-PC-LAN-IP>:8000` in the app's `.env` and restart Expo
with `--clear`. Windows may ask to allow Python through the firewall.

## Getting a YouTube API key

1. Open <https://console.cloud.google.com>, create a project, then go to **APIs & Services → Library**, search
   "YouTube Data API v3" and click **Enable**.
2. Go to **APIs & Services → Credentials → Create credentials → API key**.
3. Restrict the key to the YouTube Data API v3. Server keys can't use Android app restrictions, because the server
   calls the API, not the app.

## Tests and lint

```bash
.venv\Scripts\python -m pytest -q
```

```bash
.venv\Scripts\python -m ruff check .
```

The tests mock YouTube with `respx`, so no key or network is needed.

## Deploy (Render)

`render.yaml` describes a Docker web service with a `/health` check. Create it from the Render dashboard (**New →
Blueprint**), set `YOUTUBE_API_KEY` there, then put the service's `https://…onrender.com` URL in the app's
`EXPO_PUBLIC_API_URL`. Free instances sleep when idle, so the first request after a while is slow.
