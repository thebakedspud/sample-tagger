# Security Policy

Sample Tagger is currently an early-stage prototype. Security practices will evolve alongside product milestones.

---

## Phase 1 - MVP (No User Accounts)
- [x] Spotify credentials stored in Vercel environment variables
- [x] HTTPS enforced by Vercel
- [x] Input validation on playlist URLs
- [x] Dependencies monitored via Dependabot
- [x] CORS allowlist enforced on the Spotify token endpoint
- [x] Rate limiting on the token endpoint (per-instance, in-memory; upgrade to Upstash or similar for shared durability next)
- [x] Baseline security headers delivered via `vercel.json` (CSP, HSTS, frame/referrer/permissions policies)

---

## Phase 2 - User Accounts Launch
- [ ] Enable Row Level Security in the database
- [ ] Harden authentication and session handling
- [ ] Implement CAPTCHA on registration/login forms
- [ ] Promote rate limiting to a durable shared store (Upstash Redis or equivalent)

---

## Phase 3 - Scale / Growth
- [ ] Introduce advanced monitoring and alerting (e.g. Sentry)
- [ ] Draft and test an incident response runbook
- [ ] Commission an external security audit

---

_This roadmap evolves with the app. For background and rationale, see `SECURITY_REFERENCE.md`._
