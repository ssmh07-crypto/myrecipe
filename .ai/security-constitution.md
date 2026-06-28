# Security Constitution

## Goal

Perform a full-project security audit before PR, release, or deployment.

This is not limited to the latest change.

Audit the whole project.

## 1. Authentication

Check:

- Supabase Auth usage
- Email login
- Social login
- JWT verification
- Session handling
- Refresh token handling
- Logout behavior
- Token storage

## 2. Authorization

Check:

- Owner verification
- Admin protection
- IDOR
- URL parameter manipulation
- API parameter manipulation
- Cross-user data access

## 3. Supabase RLS

For every user-related table, check:

- RLS enabled
- SELECT policy
- INSERT policy
- UPDATE policy
- DELETE policy
- `auth.uid()` usage
- Public/private data separation

Critical:

- RLS off
- `user_id = user_id`
- authenticated-only policy without owner check
- Missing owner verification

## 4. Database Security

Check:

- SQL Injection
- Raw SQL usage
- Parameterized queries
- Personal data exposure
- Public/private separation
- Indexes for authorization queries

## 5. Input Validation

Check:

- Schema validation
- Type validation
- Length limits
- JSON validation
- Special characters
- XSS
- Path Traversal
- Command Injection
- Header Injection

## 6. URL Import Security

Check:

- SSRF
- localhost blocked
- 127.0.0.1 blocked
- 0.0.0.0 blocked
- Internal IP blocked
- Metadata endpoint blocked
- Redirect final URL validation
- Timeout
- Max response size
- http/https only

## 7. Cloudflare Functions

Check:

- JWT verification
- Authorization header handling
- Secret usage
- Error response safety
- CORS policy
- Debug mode off
- Rate limit for expensive endpoints

## 8. Cloudflare R2

Check:

- R2 secrets not exposed
- Upload auth
- Delete auth
- Owner verification
- UUID filenames
- MIME validation
- File size limits
- Presigned URL expiration
- Public/private policy
- Safe object paths
- Orphan object cleanup

## 9. React Native

Check:

- No secret in app bundle
- Secure token storage
- No debug logs in release
- No token logging
- WebView risks
- Deep link risks

## 10. OpenAI

Check:

- API key not exposed
- Server-side calls only
- Auth required
- Rate limit
- Quota
- Cache
- Prompt injection
- Abuse prevention
- Long input limit

## 11. Supadata

Check:

- API key not exposed
- Server-side calls only
- Auth required
- Rate limit
- Cache
- Abuse prevention
- URL validation

## 12. Firebase

Check:

- Analytics does not receive sensitive personal data
- Crashlytics does not receive tokens or secrets
- No full API responses logged
- Firestore/Storage rules if used

## 13. GitHub

Check:

- `.env` not committed
- `.dev.vars` not committed
- Secrets not committed
- Git history checked
- Branch protection
- GitHub Actions secrets
- Secret scanning
- Dependabot

## 14. Dependencies

Check:

- npm audit
- Known CVEs
- Outdated packages
- Unnecessary packages
- Suspicious postinstall scripts

## 15. Deployment

Check:

- HTTPS
- CSP
- Referrer-Policy
- X-Frame-Options
- X-Content-Type-Options
- Production debug off
- Source maps not publicly exposed

## Critical Conditions

Immediately classify as Critical:

- Supabase service_role key exposed
- OpenAI key exposed
- Supadata key exposed
- R2 secret exposed
- JWT secret exposed
- RLS disabled
- Missing owner verification
- Auth-free paid API call
- Auth-free R2 upload/delete
- SSRF possible
- SQL Injection possible
- Command Injection possible
- Path Traversal possible
- Secret found in Git history

## Required Output

Classify issues:

- Critical
- High
- Medium
- Low

For each issue include:

- File
- Problem
- Attack scenario
- Impact
- Fix

Also include:

1. Files to fix
2. Suggested secure code
3. Retest checklist
4. Final deployment decision: YES / NO
