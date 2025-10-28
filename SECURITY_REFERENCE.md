# Security Policy Reference

Playlist Notes is a React + Vite prototype deployed on Vercel. It imports public playlists, stores notes locally, and exposes two anonymous endpoints: `/api/anon/bootstrap` issues device/recovery codes, and `/api/anon/restore` redeems them. There is still no full user account system or database, but we now handle short-lived secrets for these flows. This document captures the guardrails we follow today and the improvements we plan as the app grows. Review it before shipping changes to authentication, data access, or infrastructure.

---

## Reporting a Vulnerability

- File a private report via GitHub's **Security -> Report a vulnerability** workflow. Please avoid public issues for security bugs.
- Include reproduction steps, affected endpoints, and any logs or screenshots that demonstrate impact.
- If GitHub's channel is unavailable, contact the maintainer directly with the subject "Playlist Notes Security".
- We aim to acknowledge reports within two business days and keep reporters updated until resolution.

---

## Core Security Principles

- **Least privilege**: limit credentials and API scopes to the minimum required for each environment.
- **Defense in depth**: combine HTTPS, validation, throttling, and monitoring rather than relying on a single layer.
- **Fail safe**: reject unexpected input and disable risky features until they are reviewed.
- **Privacy by default**: collect only the data a feature absolutely needs and expire logs when they no longer provide value.

---

## Baseline Controls (Current)

| Area | Why it matters | Practical action |
| --- | --- | --- |
| Secrets & environment variables | Exposed keys are harvested quickly by repo scanners. | Store keys only in Vercel -> Settings -> Environment Variables; never commit `.env`; rotate keys every 90 days; separate preview vs production values. |
| HTTPS everywhere | Plain HTTP leaks tokens and recovery codes. | Vercel enforces HTTPS; avoid `http://` embeds; add HSTS preload once the custom domain is stable. |
| Rate limiting | Prevents abuse of bootstrap/restore APIs and surprise billing spikes. | Use Vercel Edge Middleware or `express-rate-limit`; enforce strict limits (e.g., 100 req/hour/IP) on `/api/anon/bootstrap` and `/api/anon/restore`; promote to a shared store (Upstash) before launch. |
| Input validation & sanitization | Blocks XSS, injection, and malformed recovery codes. | Validate URLs and recovery codes with `zod`/`validator`; escape any user-sourced text; reject unknown query params. |
| Security headers | Adds a cheap layer against browser threats. | Apply `helmet` or `next-safe-middleware`; configure CSP, `X-Frame-Options: DENY`, strict `Referrer-Policy`, and `Permissions-Policy`. |
| Dependency hygiene | Outdated packages are a common exploit vector. | Enable Dependabot or Renovate; merge security patches promptly; run `npm audit --production` before deploys. |
| Secret management | Hard-coded creds equal instant compromise. | Prefer managed secret stores (AWS/GCP Secret Manager) for long-lived secrets; inject via env vars; keep recovery-code signing secrets server-only. |
| Code review & AI assistance | AI-generated diffs can hide unsafe logic. | Require human review on security-sensitive changes; enforce branch protection; read diffs carefully. |
| Monitoring & incident prep | Faster detection reduces downtime and impact. | Enable Vercel Analytics/Sentry (or similar); alert on bootstrap/restore failures and 5xx spikes; document key revocation steps. |

---

## Secure Development Checklist

- Sanitize playlist URLs, recovery code submissions, and all other user inputs before storage or rendering.
- Do not merge pull requests with failing tests or unresolved security comments.
- Document new API endpoints, expected parameters, and error handling in `README.md` or an ADR.
- Lock build tooling to known versions (`npm ci` with `package-lock.json`).
- Ensure local development uses distinct environment variables from production.

---

## Maintenance Rhythm

| Frequency | Task |
| --- | --- |
| Daily | Review deployment logs and analytics; investigate spikes quickly; watch anon API traffic for abuse. |
| Weekly | Run the automated test suite; review Dependabot PRs; verify rate limiting metrics. |
| Monthly | Audit dependencies; rotate keys scheduled to expire; confirm security headers remain intact; spot-check recovery code issuance. |
| Quarterly | Reassess rate limits, CAPTCHA/Turnstile needs, Row Level Security requirements, and privacy posture. |

---

## Roadmap & Triggers

- **Authentication launch**: when user accounts ship, enable Row Level Security (e.g., `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) with per-table policies tied to `auth.uid()`.
- **User-generated uploads**: add malware scanning and per-user storage buckets/ACLs before accepting uploads.
- **Spikes in bot traffic**: add Cloudflare Turnstile or reCAPTCHA v3 to public forms and throttle anon APIs.
- **New third-party integrations**: mint separate API keys per environment and review scopes before deployment.
- **Incident response maturity**: draft a lightweight runbook (contact tree, key revocation checklist, status update template) and test it twice per year.

---

## Staying Informed

- Subscribe to vendor status pages (Vercel, upstream APIs) for outage alerts.
- Track high-impact CVEs relevant to React, Node.js, and major dependencies.
- Revisit this document whenever infrastructure, auth models, or data sensitivity change.

Security is never "done"; treat this file as a living policy and update it alongside meaningful architecture or process changes.
