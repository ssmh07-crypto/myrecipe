# Pre Coding Checklist

## Goal

Before writing code, analyze:

- Structure
- Security
- Performance
- Cost
- Maintainability

Do not start implementation until this checklist is completed.

## 1. Feature Summary

Clarify:

- What the feature does
- Who uses it
- Main user flow
- Expected result

## 2. Existing Structure Analysis

Check:

- Is there a similar feature?
- Can an existing component be reused?
- Can an existing hook be reused?
- Can an existing service be reused?
- Can an existing Cloudflare Function be extended?
- Is a new file really necessary?

## 3. Data Impact

Check:

- New table needed?
- New column needed?
- Migration needed?
- Index needed?
- RLS policy change needed?
- Public/private data separation needed?

## 4. API Design

Check:

- Is a new API needed?
- Can an existing API be reused?
- Correct method: GET / POST / PATCH / DELETE
- Required input schema
- Required output shape
- Error cases

## 5. Authentication and Authorization

Check:

- Login required?
- JWT verification needed?
- Owner verification needed?
- Admin permission needed?
- Can a user access another user’s data?

## 6. Security Risks

Check whether the feature introduces:

- IDOR
- SSRF
- SQL Injection
- Command Injection
- Path Traversal
- XSS
- Prompt Injection
- API abuse
- Secret exposure

## 7. External API Impact

For OpenAI and Supadata:

- Is the API call necessary?
- Can the result be cached?
- Expected call volume
- Timeout handling
- Retry handling
- Rate limit needed?
- Cost risk

## 8. R2 Storage Impact

Check:

- Upload needed?
- Download needed?
- Delete needed?
- Presigned URL needed?
- UUID filename needed?
- MIME validation needed?
- File size limit needed?
- Owner check needed?

## 9. UX Impact

Check:

- Loading state
- Error state
- Empty state
- Retry behavior
- Offline behavior
- Disabled button during request

## 10. Performance Impact

Check:

- Duplicate API calls
- Unnecessary re-render
- Pagination
- Lazy loading
- Cache
- N+1 query
- Large payload

## 11. Cost Impact

Check:

- OpenAI cost
- Supadata cost
- Cloudflare Function calls
- Supabase DB calls
- R2 storage/download
- Duplicate paid requests

## 12. Test Plan

Plan tests for:

- Normal case
- Logged-out user
- Wrong owner
- Invalid input
- Long input
- API failure
- Network failure
- Duplicate request

## Required Output

Before implementation, output:

1. Feature summary
2. Current structure analysis
3. Required changes
4. Security risks
5. Performance impact
6. Cost impact
7. DB impact
8. API design
9. Test plan
10. Expected files to modify
11. Implementation difficulty: Easy / Medium / Hard
12. Final recommendation: YES / NO

Do not write code before completing this analysis.
