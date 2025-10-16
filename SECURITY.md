# Security Policy

Sample Tagger is currently an early-stage prototype.  
Security practices scale with each phase of development.

---

## Phase 1 — MVP (No User Accounts)
✅ Spotify credentials stored in Vercel environment variables  
✅ HTTPS enforced by Vercel  
✅ Input validation on playlist URLs  
✅ Dependencies monitored via Dependabot  
🔲 Rate limiting on token endpoint *(planned)*  

---

## Phase 2 — User Accounts Launch
- [ ] Enable Row Level Security in database  
- [ ] Harden authentication and session handling  
- [ ] Add security headers (via helmet.js or middleware)  
- [ ] Implement CAPTCHA on registration/login forms  

---

## Phase 3 — Scale / Growth
- [ ] Introduce advanced monitoring and alerting (e.g. Sentry)  
- [ ] Draft and test an incident response runbook  
- [ ] Commission an external security audit  

---

_This roadmap evolves with the app. For deeper background and rationale, see `SECURITY_REFERENCE.md` (archived)._
