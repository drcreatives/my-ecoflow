---
description: "Generate test boilerplate for a Convex backend module or React frontend component"
argument-hint: "module or component name (e.g., devices, DeviceStatusCard)"
agent: "agent"
---

Generate a complete test file for `$input`.

## Instructions

1. Determine if the target is a **Convex backend module** (in `convex/`) or a **React component** (in `src/`).
2. Read the source file to understand exports, dependencies, and behavior.
3. Generate the test file following the patterns below.

## For Convex backend modules (`convex/<module>.ts`)

Create `convex/__tests__/<module>.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
```

- Mock `ctx` with `auth.getUserIdentity` returning null (unauthorized) and a valid user identity
- Test every exported query/mutation/action
- Test auth guard rejects unauthorized access
- Test happy path with expected return shape
- Test edge cases (empty results, missing records, invalid args)
- For helper functions: test directly without mocking ctx

## For React components (`src/components/<Component>.tsx`)

Create `src/__tests__/components/<Component>.test.tsx` with:

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
```

- Mock Convex bridge hooks from `@/hooks/useConvexData`
- Test rendering with typical props
- Test loading state
- Test empty/error states
- Test user interactions (clicks, form submissions)
- Use `screen.getByRole`, `getByText` — prefer accessible queries

## Naming

- Describe blocks: module/component name
- Tests: `should <behavior> when <condition>`
