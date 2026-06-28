# Testing Checklist

## Goal

Verify that the current change:

- Works correctly
- Does not break existing features
- Handles failures safely
- Does not introduce obvious security or cost issues

## 1. Functional Test

Check:

- Requirement satisfied
- Happy path works
- Existing related features still work
- Android behavior
- iOS behavior

## 2. Input Test

Test:

- Empty value
- Null
- Undefined
- Very long string
- Special characters
- Emoji
- Wrong type
- Duplicate input

## 3. Authentication Test

Test:

- Logged-in user
- Logged-out user
- Expired token
- Wrong user
- Unauthorized user

## 4. Authorization Test

Test:

- User can access own data
- User cannot access others’ data
- Owner check works
- Admin-only action is protected

## 5. Database Test

Test:

- Select
- Insert
- Update
- Delete
- RLS policy
- Migration
- Rollback if relevant

## 6. Cloudflare Function Test

Test:

- JWT verification
- Input validation
- Error handling
- Timeout handling
- Rate limit behavior if implemented

## 7. OpenAI Test

Test:

- Normal response
- API error
- Timeout
- Long input
- Prompt injection-like input
- Duplicate request

## 8. Supadata Test

Test:

- Normal response
- Invalid URL
- API error
- Timeout
- Rate limit

## 9. Cloudflare R2 Test

Test:

- Upload
- Download
- Delete
- MIME validation
- Size limit
- Owner verification
- Invalid file

## 10. UI Test

Test:

- Loading state
- Error message
- Empty state
- Retry button
- Disabled button during request
- No duplicated submission

## 11. Offline / Network Test

Test:

- No internet
- Slow network
- API unavailable
- Reconnect behavior

## 12. Performance Test

Check:

- Duplicate API calls
- Unnecessary re-render
- Large list performance
- Pagination/lazy loading
- Cache behavior
- Memory leak

## 13. Logging Test

Check logs do not contain:

- Token
- Password
- Authorization header
- API key
- Personal data

## 14. Regression Test

Check related features such as:

- Login
- Recipe create
- Recipe edit
- Recipe delete
- URL import
- Image upload
- Favorites
- Search
- Recipe book/category

## Required Output

Classify each result:

- PASS
- WARNING
- FAIL

For each issue include:

- Cause
- Impact
- Fix

Final answer:

Is this change ready?

YES / NO
