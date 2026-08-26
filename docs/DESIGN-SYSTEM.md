# LUMA design system

One look across the whole app. The platform admin panel set the visual language;
this file is that language written down so every other surface can match it, and
so nobody has to reinvent a card, a pill, or an empty state again.

**The rule:** if two pages need the same furniture, it lives in `src/styles/ui.scss`.
If exactly one page needs it, keep it local to that page.

## Where things live

| File                   | Contains                                                     | How to use it                                      |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------- |
| `src/styles/col.scss`  | **Tokens only** — colors, radii, shadows, spacing constants. | `@use '../../styles/col.scss' as *;` per component |
| `src/styles/ui.scss`   | **Shared classes** — panels, pills, tables, states.          | Nothing to import. Just use the class names.       |
| `src/styles/luma.scss` | Bootstrap theme + global element styles. Loads `ui.scss`.    | Imported once in the root `+layout.svelte`.        |

`col.scss` is variables-only **on purpose**: ~30 components `@use` it with `as *`,
so any rule written there would be emitted once per component. Rules go in `ui.scss`,
which is loaded exactly once.

## Tokens

Use the named token, never the hex. Before this system there were ~350 raw hex
literals in components — `#878fa1` appeared 46 times and is simply `$light-tertiary`.

### Brand

| Token               | Value     | Use                          |
| ------------------- | --------- | ---------------------------- |
| `$yellow-primary`   | `#ffc800` | Accent, active nav, CTA fill |
| `$yellow-secondary` | `#e8aa00` | Hover/active on yellow       |
| `$dark-primary`     | `#0f1112` | Sidebars, navbars, headings  |
| `$dark-secondary`   | `#192b2e` | Dividers on dark             |
| `$light-secondary`  | `#f3f6fc` | Page background              |
| `$light-tertiary`   | `#878fa1` | Muted text                   |

### Surfaces, lines, text

`$surface` (white cards) · `$surface-sunken` (page bg) · `$surface-muted` (table
headers, inset rows) · `$border` · `$border-strong` (inputs) · `$border-faint`
(row separators) · `$text` · `$text-muted` · `$text-subtle` (timestamps,
placeholders) · `$text-body` (secondary prose).

### Status

Each tone comes as a trio so badges, alerts, and banners stay in step:

| Tone    | Accent     | Foreground    | Background    |
| ------- | ---------- | ------------- | ------------- |
| Danger  | `$danger`  | `$danger-fg`  | `$danger-bg`  |
| Success | `$success` | `$success-fg` | `$success-bg` |
| Warning | `$warning` | `$warning-fg` | `$warning-bg` |
| Info    | `$info`    | `$info-fg`    | `$info-bg`    |

### Shape and depth

`$radius-sm: 5px` · `$radius: 8px` (the default) · `$radius-lg: 12px` ·
`$radius-pill: 999px`.
`$shadow-sm` (list rows) · `$shadow` (resting card) · `$shadow-lg` (hover) ·
`$shadow-modal`.

## Classes

All global — no import needed.

### Page structure

```svelte
<div class="page-head">
	<div>
		<h4 class="page-title">Candidates</h4>
		<p class="page-subtitle">Everyone who has applied, and where they stand.</p>
	</div>
	<div class="page-actions">
		<button class="btn btn-tertiary btn-sm">New job</button>
	</div>
</div>

<div class="section-title">Pipeline</div>
```

`.page-head` · `.page-title` · `.page-subtitle` · `.page-actions` · `.section-title`

### Containers

`.panel` is the default white container. It is deliberately **not** `.card` —
Bootstrap owns that name, and `luma.scss` caps `.card` at 500px for the applicant
flow.

`.panel` · `.panel-flush` (no padding, for tables) · `.panel-head` · `.panel-title`

### Data display

- `.stat-grid` + `.stat-card` / `.stat-number` / `.stat-label`
- `.list-row` (+ `.list-row-clickable`) with `.row-left` / `.row-name` / `.row-sub` / `.row-stats`
- `.data-table`, always inside `.table-scroll` so the page never scrolls sideways
- `.pill` + `.pill-success` / `.pill-danger` / `.pill-warning` / `.pill-info` / `.pill-neutral`
- `.pill-solid` when the color comes from **data** rather than a tone — pipeline stages,
  interview outcomes, per-org colors. Supply the fill inline
  (`style="background-color: {STAGE_COLORS[stage]}"`); the class fixes shape and white label.

`.pill` uppercases its text. That is deliberate and matches the admin panel, but it means
a pill is the wrong wrapper for free text an applicant typed.

### Feedback

- `.alert-soft` + `.alert-error` / `.alert-success` / `.alert-warning` / `.alert-info`
- `.empty-state` with `.empty-title` / `.empty-hint`
- `.skeleton` for loading placeholders (shared `luma-shimmer` keyframes)

### Controls

- `.filter-bar` + `.filter-label`
- `.field` / `.field-label` / `.field-hint` / `.field-error` / `.field-success`
- `.chip` (+ `.chip-selected`) — a pill wrapping a checkbox, for team pickers and scoping
- `.back-link` — small muted breadcrumb, pair with a `fi fi-br-angle-left` icon
- `.tab-bar` / `.tab-btn` (+ `.active`) / `.tab-count`
- `.btn-icon` (+ `.btn-icon-danger`) for row actions
- Buttons stay Bootstrap-shaped: `.btn-primary` (outline pill), `.btn-tertiary`
  (yellow fill), `.btn-secondary` (dark, low emphasis), `.btn-quaternary` (white)
- Destructive: `.btn-danger-solid` (filled), `.btn-danger-soft` (tinted),
  `.btn-danger-outline` (outline). The Bootstrap-shaped set has no destructive member,
  which is why six surfaces had each grown their own.
- `.btn-sm` is defined here, not per page. `ui.scss` loads after Bootstrap, so it wins on
  order — no `!important` needed, and none should be added.

### Modals

`.modal-backdrop-luma` > `.modal-panel` > `.modal-head` / `.modal-title` / `.modal-actions`

For a tall dialog that needs a sticky header and footer around a scrolling body, use
`.modal-panel .modal-panel-lg` and put the scrolling content in `.modal-body`. Plain
`.modal-panel` is a single scrolling column — right for short forms, wrong for the email
generator and the interview creator.

### Public screens

`.auth-screen` is the signed-out gradient shell (landing, auth, reset, register, invite,
apply success). Those screens keep their **dark** `$dark-primary` cards and `.input-dark`
fields — `.panel` is a white surface and would invert them.

### Text helpers

`.muted` (13px) · `.hint` (11px, no margin) · `.subtle` (12px) · `.divider` (1px rule)

## Chrome

Both shells use a dark sidebar with the same active treatment: muted label,
yellow text plus a 3px yellow left rule on the current page.

| Surface             | Shell                                                 |
| ------------------- | ----------------------------------------------------- |
| `/private/[slug]/*` | `.layout` grid + recruiter `Navbar` / `Sidebar`       |
| `/admin`            | `.admin-layout` grid + its own sidebar and header bar |
| `/apply/*`          | `.layout` grid + applicant `Navbar` / `Sidebar`       |
| Public pages        | Centered `.card` on a plain background                |

Content areas cap at `$content-max` (1100px) so pages don't sprawl on wide monitors.

## Naming collisions to know about

Three names are already taken, and shadowing them silently changes how other pages render.
Two of these were caught during the migration only because the shared rule started
restyling an unrelated element:

| Don't define locally | Why                                                           | Use instead                                 |
| -------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| `.badge`             | Bootstrap owns it                                             | `.pill` / `.pill-solid`                     |
| `.card`              | Bootstrap owns it; `luma.scss` caps it at 500px               | `.panel`                                    |
| `.pill`, `.divider`  | Shared here — a local copy wins by Svelte scoping specificity | Rename yours (`.stage-pill`, `.or-divider`) |

If you need a variant, add a **second** class next to the shared one
(`class="list-row job-row"`) and style only the delta. Never redeclare the shared name.

## Conventions

1. **Never write a raw hex** in a component. If a color isn't in `col.scss`, add it there.
2. **Never redefine a shared class locally.** Extend it with a second class instead.
3. `@use` must be the **first** thing in a component `<style lang="scss">` block —
   inserting a rule above it breaks the build with "@use rules must be written
   before any other rules".
4. Wide tables go in `.table-scroll`. The page body must never scroll horizontally.
5. Prefer a shared class over an inline `style=` attribute. Inline styles are for
   genuinely dynamic values only (a computed bar width, a per-org color).
