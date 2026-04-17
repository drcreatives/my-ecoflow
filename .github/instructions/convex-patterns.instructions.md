---
description: "Use when writing or modifying Convex backend functions — queries, mutations, actions, internal functions. Covers auth guards, error handling, argument validation, and function organization patterns."
applyTo: "convex/**/*.ts"
---

# Convex Function Patterns

## Auth Guards

Every public query/mutation must check auth first. Pattern varies by function type:

```typescript
// Queries — return empty/null for unauthorized (no throw)
const userId = await auth.getUserId(ctx);
if (!userId) return [];    // for list queries
if (!userId) return null;  // for single-item queries

// Mutations — throw for unauthorized
const userId = await auth.getUserId(ctx);
if (!userId) throw new Error("Unauthorized");
```

**Never** skip the auth check on public functions. Internal functions (`internalQuery`, `internalMutation`, `internalAction`) do not need auth guards.

## Imports

```typescript
import { query, mutation, action } from "./_generated/server";
import { internalQuery, internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
```

Use `"use node";` at the very top (before all imports) only for actions that need Node.js APIs (crypto, fetch to external services).

## Argument Validation

Always use Convex validators — never trust client input:

```typescript
args: { deviceId: v.id("devices") }                          // ID reference
args: { name: v.string(), email: v.optional(v.string()) }    // strings
args: { days: v.float64() }                                  // numbers
args: { enabled: v.optional(v.boolean()) }                   // optional bool
```

Use `v.id("tableName")` for foreign key references, never `v.string()`.

## Return Patterns

- Map DB documents to client-safe objects — don't return raw `_id` / `_creationTime` unless needed
- Use nullish coalescing for optional fields: `reading.batteryLevel ?? null`
- Return default objects when DB record is missing rather than null

## Index Queries

Always use indexes for filtered queries:

```typescript
const devices = await ctx.db
  .query("devices")
  .withIndex("by_userId", (q) => q.eq("userId", userId))
  .collect();
```

## File Organization

- Section comments: `// ─── Queries ──────`, `// ─── Mutations ──────`
- Constants for defaults at module top: `const DEFAULTS = { ... }`
- Helper functions below exports or in separate files
- One domain per file (devices, readings, settings — not mixed)
