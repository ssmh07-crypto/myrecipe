# Quick Security Check

## Goal

Review only the current change set.

Do not audit the entire project unless explicitly requested.

## 1. Authentication

Check:

- Did this change add a new unauthenticated API?
- Does the Cloudflare Function verify JWT?
- Is `user_id` taken from verified JWT instead of client input?

## 2. Authorization

Check:

- Is owner verification enforced?
- Can changing an ID access another user’s data?
- Are admin-only actions protected?

## 3. Supabase RLS

Check:

- Does this change require RLS updates?
- Does the policy use `auth.uid()`?
- Are public and private data separated?

Critical:

- RLS off
- Owner check missing
- `user_id = user_id`
- authenticated-only policy without owner check

## 4. Input Validation

Check:

- Schema validation
- Length limits
- Type checks
- URL validation
- XSS risk
- SQL Injection risk
- Path Traversal risk

## 5. External APIs

For OpenAI and Supadata:

- Keys are not exposed
- Calls go through Cloudflare Functions
- Auth is required
- Rate limit considered
- Cache considered
- Long input blocked

## 6. Cloudflare R2

Check:

- R2 secrets not exposed
- Upload/delete requires auth
- Owner check exists
- UUID filename used
- MIME validated
- File size limited
- Presigned URL expiration is short

## 7. Secrets

Check that no new secret appears in:

- Code
- Logs
- `.env`
- `.dev.vars`
- `wrangler.toml`
- Git diff

## 8. Logging

Check logs do not include:

- Access token
- Refresh token
- Authorization header
- Password
- Personal data
- API keys

## 9. Error Handling

Check:

- No stack trace exposed to user
- No internal path exposed
- No DB schema exposed
- No secret exposed

## 10. Cost and Abuse

Check:

- No repeated paid API calls
- Cache used where possible
- Rate limit considered
- Duplicate request blocked
- Failure does not retry infinitely

## Required Output

For each issue, classify:

- PASS
- WARNING
- CRITICAL

Include:

- Problem
- Impact
- Fix

Final answer:

Is this change safe to deploy?

YES / NO

If NO, explain why.
