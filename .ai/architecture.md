# Architecture

## Goal

Keep the project structure consistent, secure, and maintainable.

Before adding a feature, analyze the current structure and reuse existing patterns.

## Standard Flow

UI

↓

Hook

↓

Service

↓

Cloudflare Function

↓

Supabase / R2 / External API

## Folder Responsibilities

### `/components`

Pure UI components.

Must not contain:

- API calls
- Database access
- Secret handling
- Complex business logic

### `/hooks`

React state and screen-level behavior.

May call services.

Must not directly call external APIs or Supabase if a service already exists.

### `/services`

Business logic.

May handle:

- API calls
- Data transformation
- Caching
- Repository-style access
- Request orchestration

### `/utils`

Pure helper functions.

Must be:

- Reusable
- Side-effect free when possible
- Independent from UI

### `/functions`

Cloudflare Functions.

Responsible for:

- JWT verification
- Input validation
- OpenAI calls
- Supadata calls
- R2 access
- Server-side authorization
- Secure error handling

## React Native Rules

- Keep screens thin
- Move repeated logic into hooks
- Move business logic into services
- Avoid large components
- Avoid unnecessary global state
- Prefer local state first

State priority:

1. Local state
2. Custom hook
3. Context
4. Global state

## API Rules

Use clear REST semantics:

- `GET` for read
- `POST` for create/action
- `PATCH` for partial update
- `DELETE` for delete

Every sensitive API must verify:

- JWT
- Owner
- Input schema
- Rate limit when needed

## Database Rules

- Use Supabase SDK when possible
- Use parameterized queries for raw SQL
- Protect user data with RLS
- Use `auth.uid()` for owner checks
- Separate public and private data clearly

## R2 Storage Rules

Object paths should be scoped by user.

Recommended pattern:

`users/{auth_user_id}/{uuid}.{ext}`

Required:

- UUID filenames
- MIME validation
- File size limit
- Owner check
- Safe delete flow
- Orphan object cleanup strategy

## Naming Rules

- Components: `PascalCase`
- Hooks: `useCamelCase`
- Services: `camelCase`
- Utilities: `camelCase`
- Constants: `UPPER_SNAKE_CASE` or clear typed objects

File names should clearly describe their purpose.

## Refactoring Rule

If duplication is found, suggest refactoring before adding more code.

Prefer improving the structure over adding another workaround.
