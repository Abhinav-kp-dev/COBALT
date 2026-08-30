# Google Earth Engine Setup Guide (MineGuard)

This project needs Google Earth Engine access. The auth must be set up **once** before running `docker-compose up -d --build`.

## Prerequisites

- A Google account (Gmail works)

## Step 1: Register for Earth Engine (free)

1. Go to **https://code.earthengine.google.com/register**
2. Sign in with your Google account
3. Fill out the short form (name, institution, purpose — "research" is fine)
4. Approval is usually instant. You'll get a confirmation email.

## Step 2: Create / Use a Google Cloud Project

1. The code expects a project: `monarch-507004`.
2. If **you** created that project, you can use it directly.
3. Else, either:
   - Ask the project owner to add you, or
   - In `phase1_detection.py:15`, change `PROJECT_ID` to **your own** cloud project ID (see `docker-compose.yml:28` too).

## Step 3: Authenticate (Two Options)

### Option A — Personal Login (SIMPLEST, use with Docker)

1. On your **host machine** (not inside a container), install the SDK:
   ```bash
   pip install earthengine-api
   ```
2. Run:
   ```bash
   earthengine authenticate
   ```
3. A browser window opens → sign in with your Google account → copy the code back into the terminal.

That's it. The Docker setup already mounts your credentials into the container:
```yaml
${HOME}/.config/earthengine:/root/.config/earthengine:ro   # docker-compose.yml:40
```

### Option B — Service Account Key

1. In Google Cloud Console → **APIs & Services → Credentials → Create Credentials → Service Account Key**.
2. Create/download a JSON key.
3. Rename it and place it in the project:
   ```bash
   cp path/to/downloaded-key.json backend/gee-key.json
   ```

## Step 4: Verify

```bash
cd backend && python -c "import ee; ee.Initialize(); print('GEE OK')"
```

You should see `GEE OK`. Then run:

```bash
docker-compose up -d --build
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `Earth Engine initialization failed` on startup | Make sure you completed **Step 1** (registration) and Step 3 auth |
| `"Login failed"` / account not enabled | Earth Engine registration is still pending — wait for the email |
| `project not found` | Your Google Cloud project doesn't exist or differs from `monarch-507004` — fix `PROJECT_ID` in `phase1_detection.py:15` |
| Service account `permission denied` | In Cloud Console, grant the service account the **Earth Engine Resource Admin** role |

## How Auth Works in This Code

`phase1_detection.py:30-118` tries **5 methods** in order:

1. `backend/gee-key.json` (service account file)
2. Earth Engine `ServiceAccountCredentials`
3. `GOOGLE_APPLICATION_CREDENTIALS` env var
4. Mounted host credentials (`~/.config/earthengine`)
5. Plain `ee.Initialize()` (anonymous)

For local Docker runs, **Option A** (method 4) is the most reliable.