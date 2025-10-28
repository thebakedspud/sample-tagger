# Security Policy

Playlist Notes is an early-stage prototype. Security practices evolve alongside product milestones and the growing anonymous device/recovery flows.

---

## Phase 1 - MVP (Anonymous devices, no user accounts)
- [x] Spotify credentials stored in Vercel environment variables
- [x] HTTPS enforced by Vercel
- [x] Input validation on playlist URLs
- [x] Dependencies monitored via Dependabot
- [x] CORS allowlist enforced on the Spotify token endpoint
- [x] Baseline security headers delivered via `vercel.json` (CSP, HSTS, frame/referrer/permissions policies)
- [x] `/api/anon/bootstrap` issues device/recovery codes; secrets stay server-side
- [x] `/api/anon/restore` validates recovery codes server-side before returning notes
- [ ] Promote rate limiting for anon APIs to a durable shared store (Upstash Redis or similar) instead of in-memory only
- [ ] Add structured logging/alerting for bootstrap/restore failures

---

## Phase 2 - User Accounts Launch
- [ ] Enable Row Level Security in the database
- [ ] Harden authentication and session handling
- [ ] Implement CAPTCHA or Turnstile on registration/login forms
- [ ] Expand rate limiting (global + per-user) using a durable store
- [ ] Encrypt recovery backups at rest if they leave the browser

---

## Phase 3 - Scale / Growth
- [ ] Introduce advanced monitoring and alerting (e.g. Sentry)
- [ ] Draft and test an incident response runbook
- [ ] Commission an external security audit

---

_This roadmap evolves with the app. For background and rationale, see `SECURITY_REFERENCE.md`._
