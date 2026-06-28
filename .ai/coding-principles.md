# Coding Principles

## Goal

Write code that is readable, secure, testable, and maintainable.

## General Rules

Always:

- Prefer clarity over cleverness
- Use descriptive names
- Keep functions small
- Keep files focused
- Use early returns
- Validate inputs at boundaries
- Handle errors explicitly
- Avoid hidden side effects

Never:

- Hardcode secrets
- Duplicate logic
- Use magic numbers without explanation
- Add dead code
- Leave temporary TODO/FIXME implementations
- Swallow errors silently

## Function Rules

A function should do one thing.

If a function becomes hard to explain in one sentence, split it.

Avoid deeply nested conditionals.

Prefer:

- Guard clauses
- Small helpers
- Clear return types

## Component Rules

Components should focus on rendering and user interaction.

Avoid putting:

- API calls
- Database logic
- Authorization logic
- Complex business rules

directly inside components.

## Error Handling

Every async operation should handle:

- Success
- Failure
- Loading
- Empty state when relevant

Do not expose internal errors to users.

## Type Safety

Use TypeScript types where possible.

Avoid `any` unless there is a clear reason.

Prefer explicit domain types for:

- User
- Recipe
- RecipeBook
- API response
- Upload result
- Usage log

## Comments

Comments should explain why, not what.

If the code needs many comments to be understood, simplify the code.

## Performance

Avoid:

- Unnecessary re-renders
- Repeated API calls
- Expensive calculations during render
- Large unpaginated lists

Use memoization only when it is actually useful.

## Cost Awareness

Before calling paid APIs such as OpenAI or Supadata:

- Check cache
- Validate input
- Enforce limits
- Avoid duplicate requests
