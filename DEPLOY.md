# FoodExpress — Deploy & Run Runbook

Everything you need to run the full system locally and ship it. Four moving parts,
**one shared Django backend**:

```
                         ┌─────────────────────────────┐
  Customer app  (5173) ─▶│                             │
  Restaurant app (5174) ─▶│  Django + DRF backend (8000)│──▶ SQLite (dev) / Postgres (prod)
  MCP server (stdio)    ─▶│   JWT · Razorpay · Google   │
                         └─────────────────────────────┘
                                     ▲
                          Gemini API  or  local Ollama
```

- **frontend/** — customer storefront (browse, cart, Razorpay checkout, Google login, AI chatbot).
- **frontend-restaurant/** — restaurant dashboard (owner login, live order queue via polling, accept → prepare → deliver, open/closed toggle).
- **backend/** — the single API both apps + the MCP server share.
- **mcp-server/** — MCP tools so an LLM can drive the whole flow: login → browse → order → **pay** → track. LLM runs via **Gemini API or local Ollama**.

Demo logins (created by `seed.py`):
- Restaurant owner → `demo_owner` / `ownerpass123`
- Customer → `demo_customer` / `customerpass123`

---

## 1. Run everything locally

Open four terminals from the repo root.

### 1a. Backend
```bash
cd backend
python -m venv .venv && . .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # then edit if you have keys (works without any)
python manage.py migrate
python seed.py
python manage.py runserver 8000
```
Health check: http://localhost:8000/ → `{"status":"ok",...}`

### 1b. Customer app → http://localhost:5173
```bash
cd frontend
cp .env.example .env            # VITE_API_URL=http://localhost:8000/api
npm install
npm run dev
```

### 1c. Restaurant app → http://localhost:5174
```bash
cd frontend-restaurant
cp .env.example .env
npm install
npm run dev
```
Sign in as `demo_owner` / `ownerpass123`. Place an order from the customer app (or MCP)
and watch it pop into this dashboard within ~4s.

### 1d. MCP server
```bash
cd mcp-server
cp .env.example .env            # set FOODEXPRESS_API_URL + provider keys
npm install
npm run build
npm start                       # or: npm run dev
```

**Quick end-to-end MCP test** (backend must be running):
```bash
node scripts/mcp-e2e.mjs        # see "MCP smoke test" below
```

---

## 2. The LLM provider toggle (API or Ollama)

Both the **chatbot** (backend) and the **MCP AI tools** work with either provider.

| Where | Env var | Values |
|-------|---------|--------|
| Backend chatbot | `CHAT_PROVIDER` | `gemini` \| `ollama` \| `auto` |
| MCP server | `MCP_LLM_PROVIDER` | `gemini` \| `ollama` \| `auto` |

- **Gemini (hosted API):** set `GEMINI_API_KEY` (get one at https://aistudio.google.com/apikey). Required in the cloud — Render/Vercel can't reach a local Ollama.
- **Ollama (local):** install https://ollama.com, run `ollama pull qwen2.5`, then set the provider to `ollama`. `OLLAMA_URL` defaults to `http://localhost:11434`.
- **`auto`** picks Gemini if a key is set, else Ollama.

---

## 3. Payments (Razorpay) — how it works

- **No keys?** The system runs in **simulated test mode**: `create_payment` mints a fake order id and `simulate_payment` marks the order **PAID + CONFIRMED**. This is how the **MCP server pays headlessly** and how local demos work with zero setup.
- **Real test-mode checkout:** paste your **TEST** keys (`rzp_test_…`) from
  https://dashboard.razorpay.com/app/keys into the backend:
  ```
  RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
  RAZORPAY_KEY_SECRET=xxxxxxxx
  PAYMENTS_TEST_MODE=True
  ```
  The customer app then opens the real Razorpay widget. Use test card
  **4111 1111 1111 1111**, any future expiry, any CVV. On success the backend
  verifies the signature server-side (`/orders/{id}/verify_payment/`).
- Keep `PAYMENTS_TEST_MODE=True` for demos so the MCP `/simulate_payment/` path stays enabled. Set it `False` to force signature-verified payments only.

Payment API (all under `/api/orders/{id}/`):
- `POST create_payment/` → `{ razorpay_order_id, amount, currency, key_id, simulated }`
- `POST verify_payment/` → body `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` → marks PAID
- `POST simulate_payment/` → test-mode: marks PAID without the widget (MCP uses this)

---

## 4. Google Sign-In setup

1. Go to https://console.cloud.google.com/apis/credentials → **Create Credentials → OAuth client ID → Web application**.
2. **Authorized JavaScript origins:** add every origin the button loads on:
   - `http://localhost:5173`, `http://localhost:5174`
   - your Vercel URLs, e.g. `https://foodexpress.vercel.app`
3. Copy the **Client ID**, then set it in **three** places (same value everywhere):
   - `backend/.env` → `GOOGLE_CLIENT_ID=...`
   - `frontend/.env` → `VITE_GOOGLE_CLIENT_ID=...`
   - `frontend-restaurant/.env` → (optional; add `VITE_GOOGLE_CLIENT_ID` + a button if you want owner Google login)
4. Without a Client ID the "Continue with Google" button simply hides — the app still works.

Flow: the browser gets a Google ID token → `POST /api/auth/google/ {credential}` → backend verifies it against `GOOGLE_CLIENT_ID`, gets-or-creates the user, returns our JWT.

---

## 5. Deploy

### 5a. Backend → Render (Postgres + web service)
`backend/render.yaml` is a blueprint. In the Render dashboard: **New → Blueprint**, point at this repo.

`build.sh` runs on every deploy: `pip install` → `collectstatic` → `migrate` → `seed.py`.

Set these secrets in the Render dashboard (they're `sync:false` in the blueprint):
| Env var | Value |
|---------|-------|
| `GEMINI_API_KEY` | your Gemini key |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | your test keys (or leave blank for simulated) |
| `GOOGLE_CLIENT_ID` | your OAuth client id |
| `CORS_ALLOWED_ORIGINS` | your two Vercel URLs, comma-separated |
| `ALLOWED_HOSTS` | `.onrender.com` (already set) |

Note the backend URL, e.g. `https://foodexpress-api.onrender.com`.

### 5b. Both frontends → Vercel (two projects, same repo)
Create **two** Vercel projects from this repo:

| Project | Root Directory | Env vars |
|---------|---------------|----------|
| foodexpress (customer) | `frontend` | `VITE_API_URL=https://<render-url>/api`, `VITE_GOOGLE_CLIENT_ID=...` |
| foodexpress-restaurant | `frontend-restaurant` | `VITE_API_URL=https://<render-url>/api` |

Build command `npm run build`, output `dist` (Vite defaults). Each has a `vercel.json`
SPA rewrite already.

After deploy, add both Vercel domains to the backend's `CORS_ALLOWED_ORIGINS` and to
Google's authorized origins, then redeploy the backend.

### 5c. MCP server
The MCP server runs wherever the LLM client lives (e.g. Claude Desktop), talking to
the **deployed** backend. Point it at prod and give it a Gemini key:

```jsonc
// Claude Desktop: claude_desktop_config.json
{
  "mcpServers": {
    "foodexpress": {
      "command": "node",
      "args": ["C:/Users/gaurm/OneDrive/Desktop/foodexpress/mcp-server/dist/index.js"],
      "env": {
        "FOODEXPRESS_API_URL": "https://foodexpress-api.onrender.com/api",
        "MCP_LLM_PROVIDER": "gemini",
        "GEMINI_API_KEY": "your-key"
      }
    }
  }
}
```
(Run `npm run build` in `mcp-server/` first so `dist/index.js` exists.)

---

## 6. Verify the deployment end-to-end

Against the **production** backend URL:

```bash
# 1. Customer logs in + places + pays via MCP (or the mcp-e2e script pointed at prod)
#    → order becomes PAID + CONFIRMED
# 2. Owner logs into the restaurant app → the order appears in the live queue
# 3. Owner clicks Accept → Start preparing → Out for delivery → Mark delivered
# 4. Customer app "My orders" reflects each status change (polling)
```

Quick API smoke test (replace BASE):
```bash
BASE=https://foodexpress-api.onrender.com/api
ACCESS=$(curl -s -X POST $BASE/auth/login/ -H "Content-Type: application/json" \
  -d '{"username":"demo_customer","password":"customerpass123"}' | python -c "import sys,json;print(json.load(sys.stdin)['access'])")
OID=$(curl -s -X POST $BASE/orders/ -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d '{"restaurant":1,"delivery_address":"Test","items":[{"menu_item":1,"quantity":1}]}' | python -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST $BASE/orders/$OID/create_payment/  -H "Authorization: Bearer $ACCESS"
curl -s -X POST $BASE/orders/$OID/simulate_payment/ -H "Authorization: Bearer $ACCESS"
```

---

## MCP smoke test

`scripts/mcp-e2e.mjs` drives the built MCP server over stdio (login → place → pay →
list). Run the backend first, then `node scripts/mcp-e2e.mjs`.

## Troubleshooting
- **CORS errors:** the failing origin must be in the backend `CORS_ALLOWED_ORIGINS`.
- **Google button missing:** `VITE_GOOGLE_CLIENT_ID` not set (expected until you configure OAuth).
- **`Simulated payments are disabled`:** set `PAYMENTS_TEST_MODE=True`.
- **Restaurant queue empty:** log in as an owner account (`is_restaurant_owner=True`); `demo_owner` owns the seeded restaurants.
- **Render free tier cold start:** first request after idle can take ~30s.
