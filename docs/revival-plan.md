# Grana.AI Revival Plan — Phases 3 to 6

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each phase task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Follow TDD: failing test → verify red → minimal code → verify green → commit (the user will commit everything himself).

**Goal:** Take Grana.AI from "working backend with verified Pluggy + AI core loop" (end of Phase 2) to a deployed product with a usable web app, a rebuilt mobile app, complete product features, and a hardened production environment.

**Where we are:** Phases 0–2 are done. Backend: Django 5.2 / DRF 3.17 / Celery 5.6 on Python 3.14, 65 passing tests. Verified live against the Pluggy sandbox: register → login → connect token → Connect widget → ownership-checked item import → paginated 90-day transaction sync → AI categorization (`gpt-4.1-mini`). The web (CRA, cannot compile) and mobile (Expo 54/RN 0.72 mismatch, cannot boot) apps are still the dead 2023 scaffolds.

**Architecture (unchanged across phases):** Django REST monolith with Celery workers; JWT auth (SimpleJWT); Pluggy for Open Banking; OpenAI for categorization; clients are thin SPAs/native apps over `/api/v1/`.

**Reference docs:** [product-spec.md](product-spec.md) (recovered original spec), `tools/pluggy-connect/` (working widget integration pattern).

---

# Phase 3 — Web App Revival

## 3.0 Tech debt carried from Phase 2

Read this before writing any Phase 3 code. Items marked **(pay now)** are paid inside Phase 3; the rest are scheduled where noted.

| # | Debt | Impact | When to pay |
|---|------|--------|-------------|
| 1 | **Pluggy page-based `GET /transactions` is deprecated — vendor removes it 2026-12-31** | Sync breaks entirely on removal | Phase 5 (Task 5.1) — hard deadline, do first |
| 2 | **No task-status endpoint** — `POST .../transactions/fetch/` and `/transactions/categorize/` return `202` + `task_id` that nothing can poll | Clients can't know when a sync finishes | Phase 3 works around it by polling `GET /transactions/` until the count stabilizes (same pattern as `tools/pluggy-connect/index.html`); real endpoint in Phase 5 (Task 5.3) |
| 3 | **No income category** — taxonomy is 8 expense buckets; salary lands in "Outros" | Category charts misrepresent income | **(pay partially now)** Phase 3 dashboard must compute receitas/despesas from the **amount sign**, never from categories. Taxonomy fix in Phase 5 (Task 5.4) |
| 4 | **Amounts serialize as JSON strings** (DRF `DecimalField` default, correct for money) | The old dashboards did `reduce()` + `.toFixed()` on strings and crashed | **(pay now)** Phase 3 API client parses money explicitly (Task 3.2) |
| 5 | **No token refresh in any client** — access tokens last 15 min | Sessions silently die; queries return empty | **(pay now)** axios refresh interceptor (Task 3.2) |
| 6 | **No Pluggy webhooks** — freshness is the daily 05:00 beat (3-day window) | Same-day transactions appear only after manual fetch | Phase 5 (Task 5.2) |
| 7 | **`AICache` rows never expire** (`expires_at` is never set) | Categories pinned forever; junk persists | Phase 5 (Task 5.5) |
| 8 | **No auth lifecycle** — no logout/blacklist, no password reset (no EMAIL_* config), no `/me` | Users can't recover accounts or manage profiles | Phase 5 (Task 5.6); Phase 3 logout is client-side token discard only |
| 9 | **No throttling on auth endpoints** | Credential-stuffing exposure | Phase 5 (Task 5.7) |
| 10 | **No `LOGGING` config** — worker failures visible only in console | Silent production failures | Phase 6 (Task 6.4) |
| 11 | **Redis is mandatory in production** — the inline sync fallback is DEBUG-only by design (gunicorn timeout) | Prod without a broker degrades to `503`/`sync_started: false` | Phase 6 provisions Redis (Task 6.2) |
| 12 | **`tools/pluggy-connect/` duplicates the future web connect flow** | Drift risk | Keep as a manual test harness; Task 3.4 ports its logic into the app as the single product implementation |

## Goal

Replace the dead CRA app with a Vite + React 19 + TypeScript app delivering the full journey in a browser: register → login → connect sandbox bank → see categorized transactions → accurate dashboard — with token refresh, correct money math, and CI coverage.

**Tech stack:** Vite 7, React 19, TypeScript 5, `@tanstack/react-query` v5 (react-query v3 is abandoned), `react-router` v7, axios, `react-pluggy-connect` (official widget wrapper), recharts, vitest + @testing-library/react.

**File structure (target):**

```
web/
  index.html
  vite.config.ts
  .env.example            # VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1
  src/
    main.tsx
    App.tsx               # router + QueryClientProvider + auth guard
    lib/api.ts            # axios instance, token storage, refresh interceptor
    lib/money.ts          # parse/format BRL decimal strings
    pages/LoginPage.tsx
    pages/RegisterPage.tsx
    pages/ConnectBankPage.tsx
    pages/DashboardPage.tsx
    components/           # stat cards, charts, transaction list
  src/**/*.test.tsx|ts    # vitest
```

### Task 3.1: Scaffold Vite app, delete CRA remains

**Files:** Delete `web/src` (CRA), `web/public`, `web/package.json`, `web/package-lock.json`; create fresh via scaffold.

- [ ] Step 1: `git rm -r web && npm create vite@latest web -- --template react-ts`
- [ ] Step 2: `cd web && npm install && npm install axios @tanstack/react-query react-router recharts react-pluggy-connect && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`
- [ ] Step 3: Add `web/.env.example` with `VITE_API_BASE_URL=http://127.0.0.1:8000/api/v1`; add `web/.env` (gitignored already via root `.gitignore`? verify — add `web/.env` pattern if needed)
- [ ] Step 4: Configure vitest in `vite.config.ts` (`test: { environment: 'jsdom', setupFiles: './src/setupTests.ts' }`)
- [ ] Step 5: Verify `npm run dev` serves on **port 5173** (already in backend CORS allowlist) and `npm run build` passes
- [ ] Step 6: Commit

### Task 3.2: API client with token refresh + money helper (TDD)

**Files:** Create `web/src/lib/api.ts`, `web/src/lib/money.ts`, tests alongside.

- [ ] Step 1: Write failing tests for `money.ts`: `parseAmount("8500.00") === 8500`, `parseAmount("-54.90") === -54.9`, `formatBRL(-54.9) === "-R$ 54,90"` (use `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`)
- [ ] Step 2: Run `npx vitest run src/lib/money.test.ts` → expect FAIL (module missing)
- [ ] Step 3: Implement `money.ts`; verify PASS
- [ ] Step 4: Write failing tests for `api.ts` using a mocked axios adapter:
  - attaches `Authorization: Bearer <access>` from storage to requests
  - on a 401 response, POSTs `auth/refresh/` with the stored refresh token, retries the original request once with the new access token
  - if the refresh itself 401s, clears tokens and redirects to `/login`
- [ ] Step 5: Verify FAIL, implement interceptors, verify PASS
- [ ] Step 6: Commit

Contract reminders: login/register respond `{user, tokens: {access, refresh}}`; refresh responds `{access}` only. Backend paths: `auth/login/`, `auth/register/`, `auth/refresh/`.

### Task 3.3: Auth pages + route guard

**Files:** Create `pages/LoginPage.tsx`, `pages/RegisterPage.tsx`, `App.tsx` guard.

- [ ] Step 1: Component test (failing): submitting LoginPage with credentials calls `api.post('auth/login/')`, stores tokens, navigates to `/dashboard`; shows the API's field errors on 400 (e.g. weak-password messages come localized from the backend)
- [ ] Step 2: Implement both pages (email, password, password_confirm, phone, cpf on register — phone/cpf optional), guard redirects unauthenticated users to `/login`, logout button clears tokens (client-side only — see debt #8)
- [ ] Step 3: Verify tests pass; manual check against the running backend
- [ ] Step 4: Commit

### Task 3.4: Bank connection page (port of `tools/pluggy-connect`)

**Files:** Create `pages/ConnectBankPage.tsx`.

- [ ] Step 1: Component test (failing): page fetches `banking/connect-token/`, renders the `<PluggyConnect>` widget with `includeSandbox` driven by `import.meta.env.DEV`, and on widget success POSTs `banking/accounts/connect/` with the `itemId`
- [ ] Step 2: Implement using `react-pluggy-connect`'s `onSuccess={(itemData) => ...}` (item id at `itemData.item.id` — see `tools/pluggy-connect/index.html` for the verified flow)
- [ ] Step 3: After connect: poll `GET transactions/` every 3s until the count stabilizes (max 8 polls — debt #2 workaround), then trigger `POST transactions/categorize/` (handle its 503 broker-down case with a friendly retry message), then navigate to `/dashboard`
- [ ] Step 4: Manual E2E vs sandbox (Pluggy Bank / `user-ok` / `password-ok` / MFA `123456`); verify accounts and transactions appear
- [ ] Step 5: Commit

### Task 3.5: Dashboard aggregation endpoint (backend, TDD)

The old dashboards computed totals from the first 20 rows client-side — wrong by design. Aggregate server-side; the `dashboard` Django app finally earns its existence.

**Files:** Create `backend/apps/dashboard/views.py`, `backend/apps/dashboard/urls.py`, `backend/apps/dashboard/test_dashboard.py`; modify `backend/config/urls.py` (add `path('api/v1/dashboard/', include('apps.dashboard.urls'))`).

Response contract for `GET /api/v1/dashboard/summary/?start_date&end_date` (dates optional, default last 90 days, validated like the fetch endpoint):

```json
{
  "balance": "14286.90",
  "income": "17000.00",
  "expenses": "-2713.10",
  "by_category": [
    {"category": "Serviços", "color": "#000000", "total": "-1372.70", "count": 5}
  ],
  "period": {"start_date": "2026-03-14", "end_date": "2026-06-12"}
}
```

Rules: `balance` = sum of the user's **active accounts'** `balance` fields; `income`/`expenses` split by **amount sign** (debt #3 — never by category); `by_category` covers expenses only, uncategorized rows under `"category": null`.

- [ ] Step 1: Write failing tests: authenticated user with 2 accounts + mixed-sign transactions gets correct sums (use exact `Decimal` strings); other users' data excluded; unauthenticated → 401; malformed date → 400
- [ ] Step 2: Verify FAIL (`no module dashboard.views`)
- [ ] Step 3: Implement with one queryset + `aggregate`/`values('category__name').annotate(Sum('amount'))` — no Python-side loops
- [ ] Step 4: Verify PASS, full suite green (`.venv/bin/python -m pytest -q`)
- [ ] Step 5: Commit

### Task 3.6: Dashboard page

**Files:** Create `pages/DashboardPage.tsx`, `components/StatCard.tsx`, `components/CategoryPie.tsx`, `components/TransactionList.tsx`.

- [ ] Step 1: Component test (failing): renders stat cards from a mocked `dashboard/summary/` payload using `money.ts` formatting; renders a paginated transaction list from `transactions/?page=N` (`{count, results}` envelope)
- [ ] Step 2: Implement: 3 stat cards (saldo/receitas/despesas), recharts pie of `by_category`, paginated list with category chips, "Sincronizar" button → `POST banking/accounts/{id}/transactions/fetch/` + poll, "Conectar banco" link
- [ ] Step 3: Verify tests; manual check renders the 16 sandbox transactions correctly (no `NaN`, BRL formatting)
- [ ] Step 4: Commit

### Task 3.7: CI for web

**Files:** Modify `.github/workflows/ci-cd.yml`.

- [ ] Step 1: Add `test-web` job: Node 22, `npm ci`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`, working-directory `web`
- [ ] Step 2: Make `build-and-deploy` `needs: [test-backend, test-web]`
- [ ] Step 3: Push branch, verify both jobs green on GitHub
- [ ] Step 4: Commit

### Phase 3 acceptance checklist

- [ ] Fresh clone + README steps → `npm run dev` works on first try
- [ ] Full journey in a browser against the sandbox: register → login → connect → transactions categorized → dashboard accurate
- [ ] Access-token expiry (wait 15 min or shrink `ACCESS_TOKEN_LIFETIME` locally) refreshes transparently — no logout, no empty screens
- [ ] `pytest` (backend) and `vitest` (web) suites green; CI green
- [ ] Root `README.md` updated: web section now documents Vite + `.env`

---

# Phase 4 — Mobile App Rebuild (Expo SDK 56)

## Why rebuild, not repair

The scaffold never ran: wrong entry point, missing `assets/`, no babel config, and Expo 54 pinned against RN 0.72 (incompatible). Expo Go only runs the latest SDK. Regenerating is strictly cheaper than repairing; the 4 screens are ~600 lines total and the web app (Phase 3) defines every API pattern to port.

**Tech stack:** Expo SDK 56 (`npx create-expo-app`), TypeScript, `@react-navigation/native-stack` (parity with the old app), `@tanstack/react-query` v5, axios, **`expo-secure-store` for tokens** (never AsyncStorage — it's unencrypted), `react-native-pluggy-connect` for the widget.

### Task 4.1: Regenerate the project

- [ ] Step 1: `git rm -r mobile && npx create-expo-app mobile --template blank-typescript`
- [ ] Step 2: Install deps above; create `mobile/.env`-equivalent via `app.config.ts` reading `EXPO_PUBLIC_API_URL` (defaults to `http://127.0.0.1:8000/api/v1`; document that physical devices need the machine's LAN IP, Android emulator needs `10.0.2.2`)
- [ ] Step 3: Verify `npx expo start` boots the blank app in Expo Go / iOS simulator before porting anything
- [ ] Step 4: Commit

### Task 4.2: Shared API layer

- [ ] Step 1: Port `web/src/lib/api.ts` and `money.ts` semantics: same refresh-interceptor behavior, tokens in `expo-secure-store` (`getItemAsync`/`setItemAsync` — the old code's bug was an un-awaited `AsyncStorage.getItem` interpolated into a header; the interceptor must `await`)
- [ ] Step 2: jest-expo tests mirroring the web client tests (attach header, refresh-retry on 401, logout on refresh failure)
- [ ] Step 3: Commit

### Task 4.3: Port the four screens

Login → Register → ConnectBank → Dashboard, same navigation graph as the old `src/App.tsx`.

- [ ] Step 1: Login/Register against the live backend (reuse request/response handling from Phase 3 pages)
- [ ] Step 2: ConnectBank: real `react-native-pluggy-connect` widget fed by `banking/connect-token/` — **delete the old screen's `setTimeout` fake entirely**; on success POST `banking/accounts/connect/`, poll transactions, trigger categorize
- [ ] Step 3: Dashboard: stat cards from `dashboard/summary/` (Phase 3 endpoint), transaction list with category chips; money formatting via the ported helper
- [ ] Step 4: Manual E2E on simulator against the sandbox connector
- [ ] Step 5: Commit per screen

### Task 4.4: CI + builds

- [ ] Step 1: CI job: `npm ci`, `npx tsc --noEmit`, `npx jest` (working-directory `mobile`)
- [ ] Step 2: Configure EAS (`eas.json`) with a `preview` profile; document `npx eas build --profile preview` in the README (store submission is out of scope until after Phase 6)
- [ ] Step 3: Commit

### Phase 4 acceptance checklist

- [ ] Full journey on iOS simulator and one physical device via Expo Go
- [ ] Tokens survive app restarts (secure store), refresh works after 15-min expiry
- [ ] CI green including mobile typecheck/tests

---

# Phase 5 — Product Completeness & Backend Depth

Ordered by urgency; 5.1 has an external deadline.

### Task 5.1: Migrate to cursor-based `GET /v2/transactions` ⚠️ deadline 2026-12-31

**Files:** `backend/apps/banking/services.py` (`get_transactions`), `backend/apps/banking/test_banking.py`.

- [ ] Step 1: Read the current Pluggy `/v2/transactions` reference **before coding** (the Phase 2 `clientUserId` bug came from assuming a payload shape; verify `cursor`/`nextCursor` field names and page-size limits against the live docs)
- [ ] Step 2: Failing tests: pagination follows `nextCursor` until null; `from`/`to` still honored; rows shape unchanged for the task layer
- [ ] Step 3: Implement behind the same `get_transactions(account_id, from_date, to_date)` signature so `tasks.py` does not change
- [ ] Step 4: Live sandbox verification (connect → sync → rows land), full suite green, commit

### Task 5.2: Pluggy webhooks for data freshness

**Files:** new `backend/apps/banking/webhooks.py` view, `urls.py`, settings `PLUGGY_WEBHOOK_URL`.

- [ ] Step 1: Failing tests: `POST /api/v1/banking/webhooks/pluggy/` with `{"event": "item/updated", "itemId": ...}` enqueues `sync_account_transactions` for that item's accounts; unknown events → 200 no-op; **verify the request signature/secret per current Pluggy webhook docs** (read first), reject invalid → 401
- [ ] Step 2: Implement; pass `webhookUrl` in `create_connect_token` options when `PLUGGY_WEBHOOK_URL` is set
- [ ] Step 3: Note: requires a public URL — local testing via `cloudflared tunnel`/`ngrok`; document in `tools/pluggy-connect/README.md`
- [ ] Step 4: Reduce beat cadence relevance (keep daily sync as backstop), commit

### Task 5.3: Task-status endpoint (pays debt #2)

- [ ] Step 1: Failing tests: `GET /api/v1/tasks/<task_id>/` returns `{status: PENDING|STARTED|SUCCESS|FAILURE, result}` via `AsyncResult`, only for authenticated users; replace web/mobile count-polling with this endpoint afterwards (follow-up tasks in each client)
- [ ] Step 2: Implement (new `apps/tasks` or under banking), commit

### Task 5.4: Income category + categories API (pays debt #3)

- [ ] Step 1: Data migration adding `Renda` to `Category` (icon/color), append it to `AIService.ALLOWED_CATEGORIES` and to the LLM prompt option list; extend `fallback_categorization` (keywords: `salario`, `pagamento recebido`, `pix recebido`, `rendimento`) — gate on `amount > 0` where the caller provides it
- [ ] Step 2: `GET /api/v1/categories/` list endpoint (read-only, authenticated) so clients stop hardcoding the taxonomy
- [ ] Step 3: TDD throughout; update dashboard `by_category` to include income rows under their real category while keeping income/expense split by sign; commit

### Task 5.5: `AICache` expiry (pays debt #7)

- [ ] Step 1: Failing test: `AIService.categorize_transaction` sets `expires_at` (30 days) on `update_or_create`; expired rows are treated as misses (logic already exists in `is_expired`)
- [ ] Step 2: Implement + a weekly beat task purging expired rows; commit

### Task 5.6: Account lifecycle (pays debt #8)

- [ ] Step 1: Logout: enable `rest_framework_simplejwt.token_blacklist` (INSTALLED_APPS + migrate), `POST auth/logout/` blacklists the refresh token; set `ROTATE_REFRESH_TOKENS=True`, `BLACKLIST_AFTER_ROTATION=True`
- [ ] Step 2: `GET/PATCH auth/me/` (email read-only; phone/cpf editable with validation — add CPF checksum validation here)
- [ ] Step 3: Password reset: requires email — configure `EMAIL_BACKEND` (console backend in dev, real SMTP/SES in Phase 6), `POST auth/password-reset/` + confirm endpoint using Django's token generator
- [ ] Step 4: TDD each endpoint; update web/mobile auth flows; commit per endpoint

### Task 5.7: Throttling (pays debt #9)

- [ ] Step 1: DRF `AnonRateThrottle` scoped to login/register/refresh/password-reset (e.g. `10/min`), `UserRateThrottle` default (e.g. `120/min`); tests assert 429 on the 11th anonymous login attempt (freeze the throttle cache between tests)
- [ ] Step 2: Commit

### Task 5.8: Insights v1 (the "AI" promise of the product spec)

Rule-based first — cheap, explainable, no model risk; LLM-written summaries can come later.

- [ ] Step 1: Contract: `GET /api/v1/dashboard/insights/` → list of `{type, title, body, severity}`; generators: month-over-month per-category delta >25%, top merchant by spend, recurring same-description monthly rows flagged as subscriptions (Netflix/Spotify pattern), spend-rate projection vs previous month
- [ ] Step 2: TDD each generator as a pure function over querysets; endpoint composes them; render cards in web + mobile dashboards
- [ ] Step 3: Commit per generator

### Phase 5 acceptance checklist

- [ ] Sync still works on `/v2` against sandbox; webhook fires end-to-end through a tunnel
- [ ] Salary categorizes as `Renda`; dashboards unchanged in income/expense math
- [ ] Logout invalidates the refresh token (verified by a failing refresh attempt)
- [ ] Password reset round-trip works with the console email backend
- [ ] Insights render in both clients

---

# Phase 6 — Production Deployment & Hardening

The CI deploy job is currently gated behind `vars.DEPLOY_ENABLED != 'true'` — it stays off until this phase completes.

### Task 6.1: Production settings split

- [ ] Step 1: Env-driven hardening in `settings.py` when `DEBUG=False`: `SECURE_SSL_REDIRECT`, `SECURE_HSTS_SECONDS=31536000`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO','https')` (Cloud Run sits behind a proxy), `CSRF_TRUSTED_ORIGINS` from env
- [ ] Step 2: `python manage.py check --deploy` passes with documented exceptions only; commit

### Task 6.2: GCP infrastructure

- [ ] Step 1: Cloud SQL Postgres 17 (`USE_SQLITE=False` path is already wired); Memorystore Redis **or** Upstash (serverless Redis, cheaper at zero scale — decide by budget); store all secrets in Secret Manager, not `--set-env-vars` (update the workflow to `--set-secrets`)
- [ ] Step 2: Cloud Run services: `web` (gunicorn, min-instances 0), `worker` (`celery -A config worker`, min-instances 1, no HTTP), `beat` (min-instances 1) — or a single always-on VM for worker+beat if Cloud Run pricing for always-on is unfavorable; migrations as a release-phase job (`gcloud run jobs`)
- [ ] Step 3: Set `DEPLOY_ENABLED=true` repo variable; verify the pipeline deploys green; smoke-test `/api/schema/` and a login on the deployed URL

### Task 6.3: Web + mobile distribution

- [ ] Step 1: Web on Vercel or Cloudflare Pages with `VITE_API_BASE_URL` pointing at Cloud Run; add the deployed origin to `CORS_ALLOWED_ORIGINS` and `ALLOWED_HOSTS`
- [ ] Step 2: Pluggy production credentials (paid plan decision) — sandbox-only until then; `includeSandbox=false` in production builds
- [ ] Step 3: Mobile EAS production build + store metadata (out of scope for first deploy; track separately)

### Task 6.4: Observability (pays debt #10)

- [ ] Step 1: `LOGGING` config: JSON to stdout (Cloud Logging picks it up), level WARNING for django, INFO for `apps.*`; Celery task failure logging
- [ ] Step 2: Sentry (free tier) for backend + web: DSN via env, release tagging in CI
- [ ] Step 3: Uptime check on `/api/schema/` + alerting; commit

### Task 6.5: LGPD baseline

Personal finance data + CPF = LGPD-covered. Minimum bar before real users:

- [ ] Step 1: `DELETE auth/me/` — full account deletion cascading bank accounts/transactions (CASCADE already in models), plus Pluggy item deletion via their API
- [ ] Step 2: Privacy policy page (web) + consent checkbox on register (boolean + timestamp on the user model)
- [ ] Step 3: Verify no PII in logs (descriptions are fine; never log CPF/emails/tokens); commit

### Phase 6 acceptance checklist

- [ ] Deployed URL serves the full journey with production Postgres/Redis
- [ ] `check --deploy` clean; HTTPS enforced; secrets only in Secret Manager
- [ ] A forced worker exception is visible in Sentry within minutes
- [ ] Account deletion removes all user data and the Pluggy item

---

## Sequencing notes

- Phases must land in order 3 → 4 → 5 → 6 except: **Task 5.1 (`/v2/transactions`) may be pulled forward any time** — it only touches `services.py` — and must not slip past Q4 2026.
- Each task is one PR-sized unit; each phase ends with its acceptance checklist run manually against the Pluggy sandbox.
- Re-verify Pluggy request/response shapes against their live docs before implementing any new Pluggy call — Phase 2's only field bug came from trusting an example instead of the API reference.
