# Plan: Dark Modular Energy Dashboard Redesign

**TL;DR** — Rebuild the entire visual layer to match the "Dark Modular Energy Dashboard" aesthetic: swap Inter for Neue Montreal, replace the current color system with a neutral-first matte palette (`#151615`/`#1f201f`/`#242624`) + EcoFlow brand accents, increase card corner radii from 8px to 18px, add soft wide shadows and thin-stroke borders, convert buttons to pill shapes, and apply consistent typography scaling with large hero metrics. The sidebar stays but gets restyled to the matte/minimal aesthetic. Login page gets the same treatment. All existing functionality is preserved — this is purely a visual reskin.

---

## Decisions

- **Brand colors**: Mapped existing EcoFlow palette to spec tokens (primary=#44af21, secondary=#00c356, tertiary=#3a6fe3)
- **Navigation**: Keeping sidebar (restyled) rather than switching to top-nav — preserves existing UX and mobile drawer pattern
- **Font files**: `public/fonts/` with `next/font/local` loading
- **Login page**: Full redesign — matte aesthetic, no glassmorphism
- **Chakra UI**: Not used in codebase despite docs — no migration needed, will update docs to remove references
- **GSAP/Framer Motion**: Installed but unused — not adding them to the reskin (Tailwind transitions are sufficient for the calm micro-animation spec)
- **Old tokens**: Deprecated during migration, removed in final cleanup step to avoid breaking intermediate builds

---

## Gate Rule: Validate & Commit After Every Step

> **This rule applies after completing each numbered step (1–36) in the plan.**

After finishing the work for a step, always run the following gate before moving to the next step:

```bash
# 1. TypeScript check — must pass with zero errors
npm run type-check

# 2. If type-check is not available, fall back to the build check
#    npm run build

# 3. Lint check
npm run lint
```

- **If either check fails**: fix all errors before proceeding. Do NOT move to the next step with broken types or lint warnings.
- **If both pass**: stage, commit, and push:

```bash
git add -A
git commit -m "redesign: step <N> — <short description of what was done>"
git push
```

**Commit message convention**: `redesign: step <N> — <description>`  
**Examples**:
- `redesign: step 1 — set up Neue Montreal font loading`
- `redesign: step 8 — create reusable Card component`
- `redesign: step 15 — reskin dashboard page`

**Never batch multiple steps into a single commit.** Each step gets its own atomic commit so any breakage can be bisected and reverted cleanly.

---

## Phase 1: Design Tokens & Font Infrastructure

### 1. Set up Neue Montreal font loading
- Create directory `public/fonts/` — user will place OTF files there (Regular, Medium, Bold at minimum)
- In `src/app/layout.tsx`, replace the `next/font/google` Inter import with `next/font/local` loading Neue Montreal OTFs, keeping Inter as a fallback via system stack. Set CSS variable `--font-neue-montreal`. Update body class from `font-sans` to use the new font variable.
- Update `src/app/globals.css`: replace `--font-inter` with `--font-neue-montreal`, set `font-feature-settings` for tabular lining numbers (`tnum`, `lnum`), add `letter-spacing` utilities matching the spec (`-0.01em` headings, `-0.02em` metrics).

### 2. Overhaul the Tailwind design tokens
In `tailwind.config.ts`:
- **Colors** — Replace current flat color keys with the new neutral/brand system:
  - `bg-base: #151615`, `surface-1: #1f201f`, `surface-2: #242624`
  - `stroke-subtle: rgba(255,255,255,0.08)`, `stroke-strong: rgba(255,255,255,0.14)`
  - `text-primary: rgba(255,255,255,0.92)`, `text-secondary: rgba(255,255,255,0.62)`, `text-muted: rgba(255,255,255,0.45)`
  - `icon: rgba(255,255,255,0.72)`
  - Keep existing brand tokens: `brand-primary: #44af21`, `brand-secondary: #00c356`, `brand-tertiary: #3a6fe3`, `success: #00e16e`, `warning: #ffa500`, `danger: #ff4444`
  - Keep `status.*` tokens as-is (already correct)
  - **Deprecate** (but leave temporarily) old `primary-black`, `primary-dark`, `accent-green` etc. for backward compatibility during migration — remove in final cleanup
- **Border radius** — Add: `card: 18px`, `pill: 999px`, `inner: 12px`
- **Shadows** — Add: `card: 0 10px 30px rgba(0,0,0,0.35)`, `card-hover: 0 14px 40px rgba(0,0,0,0.45)`
- **Font family** — Change `inter` to `'neue-montreal'` with fallbacks `['Inter', 'SF Pro Text', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif']`
- **Font size** — Add named sizes matching the type scale: `metric: [2.75rem, { lineHeight: 1, letterSpacing: '-0.02em', fontWeight: 500 }]`, `page-title: [2.125rem, { lineHeight: 1.2, letterSpacing: '-0.01em', fontWeight: 500 }]`, `section-title: [1rem, { lineHeight: 1.4, fontWeight: 500 }]`
- **Transition timing** — Add `easing-dashboard: cubic-bezier(0.2, 0.8, 0.2, 1)`

### 3. Update CSS variable layer
In `src/app/globals.css`:
- Define CSS custom properties on `:root` matching Tailwind tokens: `--bg`, `--surface-1`, `--surface-2`, `--stroke-subtle`, `--text-primary`, `--text-secondary`, `--brand-primary`
- Replace body `background: #000000` with `background: var(--bg)` (`#151615`)
- Update scrollbar: track → `#1f201f`, thumb → `#333533`
- Replace `.ecoflow-gradient`, `.ecoflow-glow`, status classes with updated values
- Add utility classes: `.card-surface` (combines bg + border + radius + shadow), `.pill-button`, `.metric-text`

### 4. Rebuild `ecoflowStyles` utility
In `src/lib/utils.ts`:
- Replace every token reference in the `ecoflowStyles` object to use new Tailwind classes (`bg-base`, `bg-surface-1`, `border-stroke-subtle`, `text-text-primary`, etc.)
- Add new presets for the design system components: `card.default` → `bg-surface-1 border border-stroke-subtle rounded-card shadow-card`, `button.pill` → `rounded-pill border border-stroke-strong px-4 py-2`, etc.
- Update `getBatteryStatusColor()` and `getDeviceStatusColor()` to return new token-based classes

---

## Phase 2: Shell & Navigation

### 5. Restyle the Sidebar
In `src/components/layout/Sidebar.tsx`:
- **Surface**: Change `bg-primary-dark` → `bg-surface-1`, `border-gray-700` → `border-stroke-subtle`
- **Active item**: Replace `bg-accent-green text-white` with `bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary` (subtle tinted highlight, not solid fill)
- **Inactive items**: `text-text-secondary hover:text-text-primary hover:bg-surface-2`
- **Logo**: Keep the Zap icon but update container to `bg-surface-2 rounded-inner` with a subtle brand-primary tint
- **User avatar**: `bg-surface-2 border border-stroke-subtle` (neutral, not green)
- **Sign-out**: Keep red-toned but match the new muted palette: `text-danger/70 hover:text-danger hover:bg-danger/10`
- **Corner radius**: Nav items get `rounded-inner` (12px)
- **Mobile overlay backdrop**: `bg-black/50 backdrop-blur-sm`

### 6. Restyle the Header
In `src/components/layout/Header.tsx`:
- **Surface**: `bg-surface-1 border-b border-stroke-subtle` (was `bg-primary-dark border-gray-700`)
- **Text**: Page title → `text-text-primary font-medium`, subtitle → `text-text-secondary`
- **Icons**: All icons → `text-icon` (`rgba(255,255,255,0.72)`), 16px size
- **Notification badge**: Keep `bg-brand-primary` pill with white text
- **Status indicator**: `bg-brand-primary` dot (same as before, just token rename)
- **Height**: Set explicit `h-14` (56px) to match spec

### 7. Restyle AppLayout
In `src/components/layout/AppLayout.tsx`:
- Container: `bg-bg-base` (was `bg-primary-black`)
- Main content area: `bg-bg-base p-5` (slightly reduce from `p-6` toward the 22px spec)

---

## Phase 3: Card System & Shared Components

### 8. Create a reusable `Card` component
Create new file `src/components/ui/Card.tsx`:
- Base `Card` component encapsulating the spec: `bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]`
- `CardHeader` sub-component: title left + optional right element (kebab menu, pill button, chip selector)
- `CardTitle` sub-component: `text-section-title font-medium text-text-primary`
- Hover state: `hover:shadow-card-hover hover:border-stroke-strong transition-all duration-160`
- Variants: `default`, `accent` (thin `border-brand-primary/20`), `hero` (spans 2 columns)

### 9. Create a reusable `PillButton` component
Create new file `src/components/ui/PillButton.tsx`:
- **Primary**: `rounded-pill border border-stroke-strong px-4 py-2 text-text-primary hover:bg-surface-2`
- **Filled**: `rounded-pill bg-brand-primary text-bg-base px-4 py-2 hover:bg-brand-secondary`
- **Ghost**: `rounded-pill px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-surface-2`
- All buttons: `text-[12px] font-medium transition-all duration-160`

### 10. Create a reusable `Toggle` component
Create new file `src/components/ui/Toggle.tsx`:
- Track: `w-12 h-6 rounded-full bg-surface-2 border border-stroke-subtle`
- On state: track `bg-brand-primary`, knob accent glow
- Off state: track neutral, muted knob
- Transition: 180ms with the dashboard easing curve
- Replace all hand-rolled toggle switches in `settings/page.tsx` and `device/[deviceId]/settings/page.tsx`

### 11. Create a `MetricDisplay` component
Create new file `src/components/ui/MetricDisplay.tsx`:
- Large value: `text-metric font-medium tracking-[-0.02em] text-text-primary` (44px/2.75rem)
- Unit label: `text-[11px] text-text-muted uppercase tracking-wider mt-1`
- Optional trend badge with subtle tinted pill background

### 12. Create a `ChipSelector` component
Create new file `src/components/ui/ChipSelector.tsx`:
- Compact pill with small chevron: `rounded-pill border border-stroke-strong px-3 py-1.5 text-xs`
- For time range selectors (Week, Month, etc.) and module selection
- Active state: `bg-brand-primary/10 border-brand-primary text-brand-primary`

### 13. Create a `KebabMenu` component
Create new file `src/components/ui/KebabMenu.tsx`:
- Three-dot overflow trigger: `text-icon hover:text-text-primary`
- Dropdown: `bg-surface-2 border border-stroke-subtle rounded-inner shadow-card p-1`, lightweight
- Menu items: `px-3 py-2 text-xs text-text-secondary hover:bg-surface-1 hover:text-text-primary rounded-[8px]`

### 14. Barrel export all new UI components
Create `src/components/ui/index.ts` exporting `Card`, `CardHeader`, `CardTitle`, `PillButton`, `Toggle`, `MetricDisplay`, `ChipSelector`, `KebabMenu`

---

## Phase 4: Page-by-Page Reskin

### 15. Dashboard page — `src/app/(dashboard)/dashboard/page.tsx`
- **Page header**: Replace `text-2xl sm:text-3xl font-bold text-accent-gray` with `text-page-title text-text-primary font-medium`. Add time/date display row (center: current time, right: date) matching the reference header layout.
- **Stat cards (`StatCard`)**: Rewrite using `Card` + `MetricDisplay`. Large metric number dominates, unit label subdued. Replace colored borders with neutral card style + brand-primary icon/accent only on key metrics.
- **Device cards**: Rewrite using `Card` component. Status indicator as subtle colored dot (not a full badge). Battery/power metrics using `MetricDisplay` pattern. Remove `hover:-translate-y-1` card lift — replace with shadow-based hover (shadow deepens, stroke brightens).
- **Add Device button**: Convert to `PillButton` with outline style.
- **Empty state**: Softer — `bg-surface-1 border border-stroke-subtle border-dashed` with muted messaging.
- **Grid**: Switch to 3-column desktop grid with 18px gap: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[18px]`

### 16. Devices page — `src/app/(dashboard)/devices/page.tsx`
- Remove `min-h-screen bg-primary-black` wrapper (parent layout handles it)
- **DeviceCard**: Use `Card` component with neutral surface. Metrics in `MetricDisplay` style. Status dot instead of full badge.
- **Search input**: `bg-surface-2 border border-stroke-subtle rounded-inner` (12px radius), `focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40`
- **Custom dropdown**: Restyle to `bg-surface-2 border-stroke-subtle rounded-inner shadow-card`
- **FAB**: Change to `bg-brand-primary rounded-full shadow-card` — keep functionality
- **Stats summary cards**: Use `Card` component with consistent styling

### 17. Add Device page — `src/app/(dashboard)/devices/add/page.tsx`
- Info panel: `bg-brand-tertiary/5 border border-brand-tertiary/15 rounded-card` (subtle blue tint)
- Discovery cards: `Card` component with hover border accent
- Register button: `PillButton` filled variant
- Back link: `PillButton` ghost variant

### 18. Analytics page — `src/app/(dashboard)/analytics/page.tsx`
- Filter panel: Use `Card`. Select inputs → `ChipSelector` or styled selects with `bg-surface-2 rounded-inner`
- Tab buttons: Replace `bg-accent-green text-black` active style with `PillButton` pattern — active = `bg-brand-primary text-bg-base`, inactive = ghost
- Summary cards: Use `Card` with `MetricDisplay`. Remove colored left borders — use subtle colored icon or dot accent instead
- Chart containers: `Card` with minimal internal padding, clean header with `ChipSelector` for time range

### 19. History page — `src/app/(dashboard)/history/page.tsx`
- Same filter/summary card treatment as analytics
- **Data table**: Header `bg-surface-2`, rows separated by `border-stroke-subtle`, hover `bg-surface-2/50`
- **Status pills**: `rounded-pill` with tinted brand colors at low opacity
- **Pagination**: `PillButton` variants — active = filled, inactive = ghost
- **Export button**: `PillButton` outline variant with brand-tertiary accent

### 20. Settings page — `src/app/(dashboard)/settings/page.tsx`
- **Tab navigation**: Replace `bg-primary-dark` container with `bg-surface-1 rounded-card p-1`. Active tab → `bg-brand-primary text-bg-base rounded-pill`, inactive → `text-text-secondary`
- **All toggles**: Replace hand-rolled switches with `Toggle` component
- **Form inputs**: `bg-surface-2 border border-stroke-subtle rounded-inner h-12`, focus state `border-brand-primary ring-1 ring-brand-primary/40`
- **Save buttons**: `PillButton` filled variant
- **Section cards**: `Card` component throughout

### 21. Device detail page — `src/app/(dashboard)/device/[deviceId]/page.tsx`
- **Metric cards**: `Card` + `MetricDisplay`. Battery level as hero metric (44px). Progress bar refined: `bg-surface-2 rounded-pill h-2` with brand-colored fill.
- **Power breakdown cards**: `Card` with colored dot indicators kept but using the new brand palette
- **Quick actions**: Convert all to `PillButton` variants
- **Loading skeleton**: `bg-surface-1 rounded-card animate-pulse` with `bg-surface-2 rounded-inner` inner bars

### 22. Device settings page — `src/app/(dashboard)/device/[deviceId]/settings/page.tsx`
- All cards → `Card` component
- All toggles → `Toggle` component
- Danger zone: `Card` with `border-danger/20`, inner `bg-danger/5`, button uses `PillButton` with danger styling

### 23. Login page — `src/app/login/page.tsx`
- **Background**: `bg-bg-base` (solid matte, no gradient)
- **Remove glassmorphism**: No more `backdrop-blur-lg`, `bg-gray-900/60`. Replace with `Card` styled container: `bg-surface-1 border border-stroke-subtle rounded-card shadow-card`
- **Logo badge**: `bg-brand-primary rounded-inner` (solid, no gradient)
- **Toggle buttons** (login/signup): `PillButton` — active = filled, inactive = ghost
- **Inputs**: `bg-surface-2 border border-stroke-subtle rounded-inner h-12`, matching dashboard inputs
- **Submit button**: `PillButton` filled (full-width pill)
- **Error/success messages**: `text-danger`/`text-success` with `bg-danger/5`/`bg-success/5` tinted containers
- **Decorative blurs**: Remove entirely — keep the background clean and matte

---

## Phase 5: Data Visualization

### 24. Restyle all Recharts components
In `src/components/charts/HistoryCharts.tsx`:
- **Grid lines**: `#242624` (surface-2) — very subtle
- **Axis text**: `rgba(255,255,255,0.45)` (text-muted), 11px
- **Axis lines**: `rgba(255,255,255,0.08)` (stroke-subtle) or hidden
- **Tooltip**: `bg-surface-2 border border-stroke-subtle rounded-inner shadow-card` — match the Card aesthetic
- **Chart color palette** — Consolidate to brand-aligned colors:
  - Battery: `#44af21` (brand-primary)
  - Input power: `#3a6fe3` (brand-tertiary)
  - AC output: `#00c356` (brand-secondary)
  - DC output: `#ffa500` (warning)
  - USB output: `#00e16e` (success)
  - Temperature: `#ff4444` (danger)
  - Efficiency: `#3a6fe3` (brand-tertiary, lighter variant)
- **Bar style**: Thin vertical bars, near-white for active data, muted for background — tight rhythmic spacing
- **Remove heavy axis lines** — minimal labels only
- **Tab buttons** inside chart cards: Use `PillButton` / `ChipSelector`

### 25. Restyle inline chart usages on dashboard and device pages
- Any page that renders Recharts directly (analytics, device detail) should use the same color palette and styling from the centralized chart config
- Create a shared chart theme object in `src/lib/chart-theme.ts` to centralize colors, grid style, tooltip style, axis style

---

## Phase 6: Micro-Components & Polish

### 26. Update Sonner toast styles
In `src/app/layout.tsx`:
- Toast background: `#1f201f` (surface-1), border `rgba(255,255,255,0.10)`, text `rgba(255,255,255,0.92)`, border-radius `18px`
- Success toast accent: `#44af21`, error: `#ff4444`

### 27. Update loading states globally
- Replace all `text-accent-green animate-spin` / `text-green-500 animate-spin` spinners with `text-brand-primary` (consistent token)
- Loading skeletons: `bg-surface-1 rounded-card` with `bg-surface-2 rounded-inner` inner shimmer bars

### 28. Update LogoutButton
In `src/components/LogoutButton.tsx`:
- `text-text-muted hover:text-danger hover:bg-danger/10 rounded-inner`

### 29. Update ReadingCollector widget
In `src/components/ReadingCollector.tsx`:
- Collapsed FAB: `bg-brand-primary rounded-full shadow-card`
- Expanded panel: `Card` styling — `bg-surface-1 border border-stroke-subtle rounded-card shadow-card`
- Collect button: `PillButton` filled

### 30. Update CronStatusWidget
In `src/components/CronStatusWidget.tsx`:
- Use `Card` component wrapper
- Status dots: `bg-brand-primary` active / `bg-text-muted` inactive
- Info box: `bg-brand-tertiary/5 border border-brand-tertiary/15 rounded-inner`

### 31. Update DeviceStatusCard & DeviceControlPanel
In `src/components/controls/`:
- `DeviceStatusCard`: Full restyle to `Card` + `MetricDisplay` + `Toggle`. Remove offline overlay text — use opacity + crossed-out icon instead.
- `DeviceControlPanel`: Update placeholder to match new card system

### 32. Focus & interaction states
In `src/app/globals.css`:
- Add global focus ring: `*:focus-visible { outline: 2px solid rgba(68,175,33,0.4); outline-offset: 2px; }`
- Remove all per-component `focus:outline-none focus:ring-2` — or keep for input-specific variants

### 33. Motion & transitions
- Replace all `duration-200`/`duration-300` with spec-aligned durations: hover = 160ms, toggle = 180ms, chart update = 220ms
- Apply `cubic-bezier(0.2, 0.8, 0.2, 1)` easing via Tailwind `ease-[cubic-bezier(0.2,0.8,0.2,1)]` or a custom named easing in config
- Remove `hover:-translate-y-1` card lifts — replace with shadow-only hover transitions

---

## Phase 7: Cleanup & Consistency Pass

### 34. Remove deprecated color tokens
- After all pages are migrated, remove old tokens from Tailwind config (`primary-black`, `primary-dark`, `accent-green`, `accent-gray`, etc.) and their nested counterparts
- Remove old CSS utility classes from globals.css (`.ecoflow-gradient`, `.ecoflow-glow`, `.bg-accent-green`, `.text-high-contrast`)
- Grep the entire codebase for any remaining old token references and replace

### 35. Remove unused dependencies from copilot-instructions
- Update `.github/copilot-instructions.md` to reflect the new design system (remove Chakra UI references, update color palette documentation, document new UI components)

### 36. Final consistency audit
- Search all `.tsx` and `.css` files for hardcoded colors (`#2b2b2b`, `#000000`, `gray-700`, `gray-800`, `green-500`, `emerald-`) and replace with design tokens
- Verify all pages render correctly at xs/sm/md/lg/xl breakpoints
- Confirm no functionality is lost — all onClick handlers, form submissions, API calls, navigation, state management remain unchanged

---

## Final Verification (after step 36)

After all steps are complete and individually committed, run this full end-to-end verification:

1. **TypeScript**: `npm run type-check` — zero errors
2. **Lint**: `npm run lint` — zero warnings or errors
3. **Production build**: `npm run build` — succeeds with no type errors or missing imports
4. **Visual check** all 8 routes: login, dashboard, devices, devices/add, analytics, history, settings, device/[id] — confirm the matte dark aesthetic, 18px rounded cards, pill buttons, and Neue Montreal font are applied consistently
5. **Responsive check**: sidebar collapse, mobile drawer, grid reflow at xs/sm/md/lg/xl breakpoints
6. **Functionality check**: reading collection, device registration, auth flow, and page-to-page SPA navigation all work identically to before the reskin
7. **Git log sanity check**: `git log --oneline -40` — confirm 36 atomic step commits on the `chore/redesign` branch, each passing CI
