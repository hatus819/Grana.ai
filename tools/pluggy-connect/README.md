# Pluggy Connect — sandbox test page

Manual end-to-end test of the bank-connection flow: login → connect token →
Pluggy Connect widget → account import → 90-day transaction sync.

## Run

The page must be served from an origin in the backend's CORS allowlist
(`http://localhost:3000` or `http://localhost:5173` by default — opening the
file directly via `file://` will fail at the login request):

```bash
# terminal 1 — backend
cd backend && .venv/bin/python manage.py runserver

# terminal 2 — this page
cd tools/pluggy-connect && python3 -m http.server 5173
```

Open http://localhost:5173, log in with a Grana.AI user, and in the widget
pick **Pluggy Bank** (sandbox): user `user-ok`, password `password-ok`,
MFA `123456`.
