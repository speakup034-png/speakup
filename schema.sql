-- SpeakUp — PostgreSQL schema
-- Random voice/video calling app. Mobile-number-first authentication.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========== USERS ==========
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number      TEXT UNIQUE NOT NULL,           -- E.164 format, e.g. +919876543210
  phone_verified_at TIMESTAMPTZ,
  email             TEXT UNIQUE,                    -- optional, for recovery only
  status            TEXT NOT NULL DEFAULT 'active',  -- active | suspended | banned
  role              TEXT NOT NULL DEFAULT 'user',    -- user | admin
  is_premium        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_phone ON users(phone_number);
CREATE INDEX idx_users_status ON users(status);

-- ========== OTP REQUESTS ==========
CREATE TABLE otp_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number  TEXT NOT NULL,
  otp_hash      TEXT NOT NULL,
  attempts      INT NOT NULL DEFAULT 0,
  consumed      BOOLEAN NOT NULL DEFAULT false,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_phone ON otp_requests(phone_number);

-- ========== PROFILES ==========
CREATE TABLE profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL,
  date_of_birth  DATE NOT NULL,
  gender         TEXT,
  country        TEXT,
  language       TEXT,
  interests      TEXT[],
  bio            TEXT,
  profile_photo  TEXT,                    -- object storage URL/reference only
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== DEVICES (for session/ban binding) ==========
CREATE TABLE devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_hash  TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_devices_hash ON devices(device_hash);

-- ========== CALL SESSIONS ==========
CREATE TABLE call_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id    UUID NOT NULL REFERENCES users(id),
  user2_id    UUID NOT NULL REFERENCES users(id),
  call_type   TEXT NOT NULL,               -- voice | video
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  duration    INT,                          -- seconds
  end_reason  TEXT                          -- ended | skipped | disconnected | timeout
);
CREATE INDEX idx_call_sessions_users ON call_sessions(user1_id, user2_id);

-- ========== SUBSCRIPTIONS ==========
CREATE TABLE subscriptions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 TEXT NOT NULL,     -- stripe | razorpay | play_billing | apple_iap
  provider_subscription_id TEXT,
  plan                     TEXT NOT NULL,     -- monthly | yearly
  status                   TEXT NOT NULL,     -- active | cancelled | expired | past_due
  start_date               TIMESTAMPTZ NOT NULL DEFAULT now(),
  renewal_date             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);

-- ========== PAYMENTS ==========
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  amount          NUMERIC(10,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'INR',
  status          TEXT NOT NULL,             -- succeeded | failed | refunded
  provider_ref    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ========== REPORTS ==========
CREATE TABLE reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID NOT NULL REFERENCES users(id),
  call_session_id  UUID REFERENCES call_sessions(id),
  reason           TEXT NOT NULL,   -- harassment | nudity | spam | scam | hate | underage | threatening | other
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | under_review | resolved | dismissed
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_reports_reported ON reports(reported_user_id);
CREATE INDEX idx_reports_status ON reports(status);

-- ========== BLOCKS ==========
CREATE TABLE blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id      UUID NOT NULL REFERENCES users(id),
  blocked_user_id UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_user_id)
);
CREATE INDEX idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked ON blocks(blocked_user_id);

-- ========== NOTIFICATIONS ==========
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  payload    JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id);

-- ========== USAGE LIMITS (daily free-call tracking) ==========
CREATE TABLE usage_limits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  calls_used   INT NOT NULL DEFAULT 0,
  UNIQUE(user_id, usage_date)
);

-- ========== ADMIN ==========
CREATE TABLE admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES users(id),
  permission    TEXT NOT NULL DEFAULT 'moderator', -- moderator | superadmin
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL,          -- suspend | ban | unban | resolve_report | dismiss_report
  target_user_id UUID REFERENCES users(id),
  report_id    UUID REFERENCES reports(id),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
