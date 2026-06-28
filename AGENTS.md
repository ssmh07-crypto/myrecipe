# AGENTS.md

## Project Stack

- React Native
- Cloudflare Pages
- Cloudflare Functions
- Supabase Auth
- Supabase PostgreSQL
- Cloudflare R2
- Firebase Analytics
- Firebase Crashlytics
- OpenAI API
- Supadata API
- GitHub

## Development Philosophy

Prioritize:

1. Security
2. Maintainability
3. Scalability
4. Performance
5. Cost efficiency

Do not write code that merely works.
Write code that can be safely maintained over time.

## Core Rules

Never:

- Trust the client
- Hardcode secrets
- Duplicate existing logic
- Add temporary TODO/FIXME implementations
- Create unnecessary files
- Put business logic in UI components
- Expose API keys in React Native
- Commit `.env`, `.dev.vars`, or secrets

Always:

- Analyze the existing structure first
- Reuse existing components, hooks, services, and utilities
- Keep responsibilities separated
- Validate inputs
- Verify authentication and authorization
- Consider cost before calling paid APIs
- Summarize changes after work

## Default Workflow

For a new feature:

1. Follow `.ai/pre-coding-checklist.md`
2. Present the implementation plan
3. Implement only after the plan is clear
4. Follow `.ai/quick-security-check.md`
5. Follow `.ai/testing-checklist.md`
6. Summarize changes

For bug fixes:

1. Identify root cause
2. Apply the smallest safe fix
3. Follow `.ai/quick-security-check.md`
4. Follow relevant parts of `.ai/testing-checklist.md`

Before PR or deployment:

1. Follow `.ai/security-constitution.md`
2. Do not deploy if any Critical issue remains

## Architecture Rule

Maintain this flow:

UI

↓

Hook

↓

Service

↓

Cloudflare Function

↓

Supabase / R2 / External API

Business logic must not live in UI components.

## Security Rules

- Use Supabase Auth for authentication
- Use verified JWT or `auth.uid()` for user identity
- Do not trust `user_id` from the client
- Enforce owner checks
- Enforce Supabase RLS
- Keep OpenAI, Supadata, R2, and service role secrets on the server only
- Use Cloudflare Secrets for sensitive values
- Never expose secrets in React Native

## Storage Rules

Cloudflare R2 uploads must use:

- Auth verification
- Owner verification
- UUID filenames
- MIME validation
- File size limits
- Safe object paths

Example:

`users/{auth_user_id}/{uuid}`

## Git Rules

Never commit:

- `.env`
- `.dev.vars`
- API keys
- Secret keys
- Service role keys
- R2 secrets
- Firebase Admin SDK keys

If a secret was committed, rotate it immediately.

## File Creation Rule

New files are the last resort.

Before creating a file, check whether an existing:

- Component
- Hook
- Service
- Utility
- Function

can be reused or extended.

## Output Rule

Before implementing, explain structural risks if they exist.

If a better architecture exists, propose it before coding.

If uncertain, say “확인 필요” instead of guessing.
