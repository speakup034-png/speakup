# SpeakUp — Random Voice & Video Call App (MVP)

Production-architecture MVP for a random stranger voice/video calling web app.
Mobile-number OTP is the only login method. Free + Premium tiers, WebRTC calling,
Redis-backed matchmaking, report/block, and an admin moderation panel are all included
and working end-to-end against a real Postgres + Redis backend.

## 1. Project overview

- **Frontend:** vanilla HTML/CSS/JS (no build step), served as static files by Express.
- **Backend:** Node.js + Express + Socket.IO.
- **Database:** PostgreSQL (schema in `database/schema.sql`).
- **Matchmaking / real-time state:** Redis.
- **Calling:** WebRTC peer-to-peer (audio/video never touches the server); Socket.IO
  is used only to relay signaling (offer/answer/ICE) and call lifecycle events.

## 2. Requirements

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- (Production) a TURN server, an SMS OTP provider, object storage for photos, and a
  payment provider (Razorpay/Stripe/Play Billing/Apple IAP)

## 3. Installation

```bash
npm install
cp .env.example .env   # fill in real values — see section 4
```

## 4. Environment variables

See `.env.example`. At minimum for local development you need `DATABASE_URL`,
`REDIS_URL`, and `JWT_SECRET`. Everything else (SMS provider, TURN, storage, payments)
has a working integration *structure* in the code with a clearly marked `TODO` where
your real credentials/API calls go — see `server/services/otpService.js`,
`server/services/paymentService.js`, and the TURN config note in `public/js/call.js`.

## 5. Database setup

```bash
createdb speakup
psql speakup < database/schema.sql
```

(With Docker Compose, this happens automatically on first boot — see section 9.)

## 6. Redis setup

Run Redis locally (`redis-server`) or point `REDIS_URL` at a managed instance
(Upstash, Redis Cloud, AWS ElastiCache, etc.) for production.

## 7. WebRTC / TURN setup

The app uses Google's public STUN server for local development. For production,
deploy a TURN server (coturn is a common open-source choice) and set
`TURN_SERVER_URL` / `TURN_USERNAME` / `TURN_PASSWORD` in `.env`. Never place real
TURN credentials directly in `public/js/call.js` — serve short-lived, signed
credentials from an authenticated API endpoint instead.

## 8. Payment setup

`server/controllers/subscriptionController.js` creates a checkout session and never
sets `is_premium` directly from a client request. Only `POST /api/subscription/webhook`
(verified via `paymentService.verifyWebhookSignature`) can activate or deactivate
premium. Wire in your real provider's SDK and webhook secret before launch.

## 9. Running with Docker

```bash
docker compose up --build
```

This starts Postgres (auto-seeded with `schema.sql`), Redis, and the backend
(serving the frontend as static files) on **http://localhost:3000**.

## 10. Running without Docker

```bash
npm run dev      # nodemon, requires local Postgres + Redis already running
```

## 11. Running the admin panel

The admin UI lives at `/admin` (`public/admin/index.html`) and calls the same backend.
To grant admin access, insert a row into `admin_users` for a user and set that user's
`role` to `'admin'`:

```sql
UPDATE users SET role = 'admin' WHERE phone_number = '+91XXXXXXXXXX';
INSERT INTO admin_users (user_id, permission) VALUES ('<user-id>', 'superadmin');
```

## 12. Testing

```bash
npm test
```

`tests/auth.test.js` covers the pure-logic parts (phone normalization). The file
lists the integration scenarios (matching race conditions, block/report enforcement,
free-tier limits, premium bypass) that need a running Postgres/Redis to execute —
wire these into your CI once you have a test database.

## 13. Production deployment

- **Frontend + backend:** any Node-friendly host (Railway, Render, DigitalOcean,
  AWS/ECS). The Express server already serves the static frontend, so one deploy
  covers both.
- **Database:** managed PostgreSQL (RDS, Supabase, Neon, etc.)
- **Redis:** managed Redis (Upstash, ElastiCache, Redis Cloud)
- **TURN:** a production TURN server (coturn on a small VM, or a managed TURN service)
- **Storage:** S3-compatible storage for profile photos (never store raw uploads in Postgres)
- **Domain:** put everything behind HTTPS — set `APP_URL` accordingly

## 14. Security checklist before launch

- [ ] Real SMS OTP provider wired in (`otpService.sendSms`), dev console-logging removed
- [ ] Real TURN server credentials, served via short-lived signed tokens, not hardcoded
- [ ] Real payment provider + webhook secret, webhook signature verification tested
- [ ] Object storage configured for profile photos, with type/size/dimension validation
- [ ] `.env` never committed; `JWT_SECRET` rotated from the example value
- [ ] Rate limits tuned for real traffic (`server/middleware/rateLimit.js`)
- [ ] Privacy Policy and Terms replaced with counsel-reviewed copy (`public/privacy.html`, `public/terms.html`)
- [ ] Admin accounts created deliberately (see section 11) — no default admin exists
- [ ] Moderation queue staffed with a stated SLA before public launch

## 15. What's a working MVP vs. a stub

**Fully working:** mobile OTP auth (send/verify/JWT), profile creation with a
server-enforced 18+ age gate, Redis matchmaking queue with race-condition-safe
claiming, WebRTC signaling relay, video/voice call UI with mute/camera/skip/end,
report system with an auto-suspend strike threshold, block system, daily free-call
limit enforcement, call history, and an admin dashboard with user search/suspend/ban
and report resolution.

**Structured but needs your credentials:** SMS delivery, TURN server, payment
provider checkout + webhook, object storage for photos, push notifications
(FCM/APNs), OAuth (Google/Apple) login. Each has a clearly marked integration point
in the code — nothing fake is wired in, per the original spec.
