---
description: "Use when implementing features, fixing bugs, or any multi-step development work. Covers testing strategy (backend and frontend), phase-based commits, and quality gates. Applies to Convex backend testing, React component testing, E2E testing, and git commit workflow."
---

# Testing & Commit Workflow

## Phase-Based Development

Every task follows two phases. Complete and test each phase before moving to the next. Commit after each successful phase.

### Phase 1: Backend (Convex)

1. Implement Convex functions (queries, mutations, actions)
2. Write tests for the new/changed functions
3. Run backend tests: `npm run test:backend`
4. Run type-check: `npm run type-check`
5. **Commit** with message: `feat(backend): <description>`

### Phase 2: Frontend (React/Next.js)

1. Implement components, hooks, pages
2. Write component tests (React Testing Library)
3. Run frontend tests: `npm run test:frontend`
4. Run lint: `npm run lint`
5. Run E2E tests if UI flow changed: `npm run test:e2e`
6. **Commit** with message: `feat(frontend): <description>`

## Commit Rules

- Commit only after all tests pass for the current phase
- Use conventional commits: `feat|fix|refactor|test(scope): description`
- Scope is `backend` or `frontend` matching the phase
- Never combine backend and frontend changes in one commit
- If a fix spans both, commit backend first, then frontend

## Testing Stack

- **Unit/Integration**: Vitest
- **Component**: React Testing Library + Vitest
- **E2E**: Playwright
- **Test scripts**:
  - `npm run test` — all unit/integration tests
  - `npm run test:backend` — Convex function tests only
  - `npm run test:frontend` — React component tests only
  - `npm run test:e2e` — Playwright E2E tests

## Convex Backend Testing

### Unit Tests (with mocks)

- Place in `convex/__tests__/<module>.test.ts`
- Mock `ctx` (query context, mutation context) to isolate logic
- Test pure helper functions directly (e.g., `transformQuotaToReading`)
- Test auth guards: verify unauthorized calls throw

```typescript
// Example: convex/__tests__/devices.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('devices', () => {
  it('rejects unauthenticated access', async () => {
    const ctx = { auth: { getUserIdentity: vi.fn().mockResolvedValue(null) } };
    await expect(handler(ctx, {})).rejects.toThrow();
  });
});
```

### Integration Tests (critical paths)

- Test against Convex dev backend for critical data flows
- Use for: reading collection pipeline, device registration, settings CRUD
- Mark with `describe.skipIf(!process.env.CONVEX_URL)` for CI flexibility

## Frontend Testing

### Component Tests (React Testing Library)

- Place in `src/__tests__/` mirroring the source structure, or colocate as `<Component>.test.tsx`
- Test user interactions, not implementation details
- Mock Convex hooks (`useQuery`, `useMutation`) from bridge hooks
- Test loading, error, and empty states

```typescript
// Example: src/components/__tests__/DeviceStatusCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useConvexData', () => ({
  useConvexDevices: vi.fn(() => ({ devices: mockDevices })),
}));
```

### E2E Tests (Playwright)

- Place in `e2e/` at project root
- Test critical user flows: login, view dashboard, device detail, settings
- Use Page Object pattern for reusable selectors
- Run against local dev server

## Quality Gates (must pass before commit)

1. `npm run type-check` — zero TypeScript errors
2. `npm run lint` — zero ESLint errors
3. `npm run test:backend` or `npm run test:frontend` — all tests pass for current phase
4. No `console.log` left in committed code (use `console.warn`/`console.error` only when intentional)

## Test Naming

- Describe blocks: module or component name
- Test names: `should <expected behavior> when <condition>`
- Example: `should show charging status when net power is positive`
