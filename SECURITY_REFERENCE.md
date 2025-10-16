## Scope
Sample Tagger is a React + Vite prototype deployed on Vercel. It currently imports public playlists and stores notes locally (no user authentication or database yet). The controls below establish a baseline for this phase and scale with planned features.

# Security Policy

The Sample Tagger project treats security as a continuous practice. This document captures the guardrails we follow today and the improvements we plan as the app grows. Review it before you ship changes that touch authentication, data access, or infrastructure.

## Reporting a Vulnerability

- Please open a private report via the repository's **Security → Report a vulnerability** feature (GitHub Security Advisory). Do not file public issues for security bugs.
- Include reproduction steps, affected endpoints, and any logs or screenshots that demonstrate impact.
- If the GitHub reporting channel is unavailable, reach out to the maintainer directly and note "Sample Tagger Security" in the subject.
- We aim to acknowledge submissions within 2 business days and will keep reporters updated until resolution.

## Core Security Principles

- **Least privilege**: limit credentials and API scopes to the minimum required for each environment.
- **Defense in depth**: combine HTTPS, validation, rate limiting, and monitoring rather than relying on a single layer.
- **Fail safe**: when in doubt, reject unexpected input and disable risky features until reviewed.
- **Privacy by default**: collect only data that the feature absolutely needs and expire logs when they no longer serve a purpose.

## Baseline Controls (Current)

| Area | Why it matters | Practical action |
| --- | --- | --- |
| Secrets & environment variables | Exposed keys are harvested within minutes by repo-scanning bots. | Store keys only in Vercel → Settings → Environment Variables; never commit `.env`; rotate keys every 90 days; separate preview vs production values. |
| HTTPS everywhere | Plain HTTP leaks tokens and credentials. | Vercel enables HTTPS by default; do not mix `http://` URLs in code or embeds; add HSTS preload once the custom domain is stable. |
| Rate limiting | Prevents spam floods and surprise billing spikes. | Add `express-rate-limit` or Vercel Edge Middleware; start strict (100 req/hour/IP) and relax based on real user feedback. |
| Input validation & sanitization | Blocks XSS, SQL injection, command injection, and data corruption. | Validate with `zod`/`validator` on both client and server; escape HTML in any user-visible string; reject unexpected query params. |
| Security headers | Adds a cheap layer against common browser threats. | Apply `helmet` or `next-safe-middleware`; configure CSP, `X-Frame-Options: DENY`, strict `Referrer-Policy`, and `Permissions-Policy`. |
| Dependency hygiene | Outdated packages are a common exploit vector. | Enable Dependabot or Renovate; review and merge security fixes promptly; run `npm audit --production` before deploys. |
| Secret management | Hard-coded creds equal instant compromise. | Prefer managed services (AWS/GCP Secret Manager) for any long-lived backend secrets; inject via environment variables, never import directly. |
| Code review & AI assistance | AI-generated code can hide unsafe logic. | Require human review on security-sensitive changes; enforce branch protection; always read diffs produced by AI tooling. |
| Monitoring & incident prep | Fast detection reduces downtime and reputational damage. | Enable Vercel Analytics, Sentry, or similar; alert on auth failures and 5xx spikes; document how to revoke keys quickly. |

## Secure Development Checklist

- Sanitize playlist URLs and all form inputs before storage or rendering.
- Do not merge pull requests with failing tests or unresolved security review comments.
- Document new API endpoints, expected params, and error handling in `README.md` or an ADR.
- Lock build tooling to known versions and pin integrity hashes (e.g., `npm ci` with `package-lock.json`).
- Ensure local development uses separate environment variables from production.

## Maintenance Rhythm

| Frequency | Task |
| --- | --- |
| Daily | Review deployment logs and error reports; investigate spikes quickly. |
| Weekly | Run automated tests; review Dependabot PRs; verify rate limiting metrics. |
| Monthly | Audit dependencies; rotate keys scheduled to expire; confirm security headers are intact. |
| Quarterly | Reassess rate limits, RLS policies, CAPTCHA effectiveness, and privacy posture. |

## Roadmap & Triggers

- **Authentication launch**: when user accounts ship, enable Row Level Security in the database (e.g., `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` with one policy per table tied to `auth.uid()`).
- **User-generated uploads**: require malware scanning and per-user storage buckets/ACLs as soon as file uploads are enabled.
- **Spikes in bot traffic**: add Cloudflare Turnstile or reCAPTCHA v3 in invisible mode on public forms.
- **New third-party integrations**: create separate API keys per environment and review scopes before deployment.
- **Incident response maturity**: draft a lightweight runbook (contact tree, key revocation steps, status update template) and test it twice per year.

## Staying Informed

- Subscribe to vendor status pages (Vercel, database provider, auth provider) for outage alerts.
- Track high-impact CVEs relevant to React, Node.js, and major dependencies.
- Revisit this document whenever the infrastructure, auth model, or data sensitivity changes.

Security is never “done”; treat this file as a living policy. Update it alongside meaningful architecture or process changes.
