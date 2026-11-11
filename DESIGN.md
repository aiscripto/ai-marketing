# Design system

## Surface

The web application is an operational marketing workbench for agency teams, founders, and in-house marketers. Light mode opens first because the central tasks involve reading dense evidence, editing copy, and preparing client-facing reports in a bright desk setting. Dark mode uses the same hierarchy for low-light work.

## Visual direction — Crouwel evidence grid

The assigned visual world is a typographic evidence grid: measured columns, sharply aligned labels, and score marks that turn project activity into a readable record. The dashboard begins with the actual project ledger and moves into recent evidence, activity, and work in progress. No decorative grid texture; the grid appears where the data needs comparison.

- **First viewport:** page title, real project and execution counts, quick workflow actions, and a project ledger with current score coverage.
- **Visitor path:** choose a project, configure a workflow, follow actual execution events, inspect evidence and recommendations, then save or export a report.
- **Signature interaction:** selecting an audit score opens its category, agent status, evidence, and source URLs in the same alignment system.
- **Cross-surface reach:** project settings, tool inputs, execution logs, calendars, reports, and agent records share column rules, compact numeric labels, and one icon stroke.
- **Risk:** a rigid grid can flatten client-ready narratives. The report-spread alternate remains legible as a future direction; the current system preserves editorial hierarchy inside reports.
- **Raise from Barcode:** status and score ranges use one consistent, high-contrast mark grammar with an adjacent text label.
- **Keep from Annual Report Plates:** source provenance, score coverage, and recommendation priority remain distinct typographic layers in report views.
- **Keep from Orienteering Maps:** every workflow keeps its project and current stage visible while users move between evidence and results.
- **Keep from Event Catalogues:** content planning uses real dates and platform fields as calendar structure.
- **Alternate:** Annual report plates use a quieter editorial spread for audit reading, with client-ready evidence and annotations as the lead composition.
- **Standing alternative:** a familiar marketing SaaS workspace follows the supplied Linear, HubSpot, and Semrush references with standard product navigation, tables, filters, and tool forms.

## Tokens — premium 3D dashboard (current)

The authenticated app now follows a premium, 3D-inspired SaaS dashboard language: soft lavender canvas, layered glass panels, purple-tinted depth, and lightweight SVG 3D illustrations. Data rules from this document still apply: every metric comes from the API.

- Files: `src/styles/tokens.css` (all variables, light + dark) → `globals.css` (structure/layout) → `premium.css` (depth, glass, gradients, motion, dashboard and messaging compositions). Components never hard-code colors.
- Palette: primary `#633BFA`, deep `#3510B8`, electric `#7B35FF`, lavender `#C7A8FF`, soft pink `#E8B6FF`, canvas `#F5F4FF`, surface `#FFFFFF`, ink `#17152B`, secondary ink `#6B6984` (darkened from `#77758E` for AA on small text; `#77758E` is used for captions), rule `#E9E6F5`. Semantic green/amber/rose remain for status.
- Gradients (`--grad-primary`, `--grad-hero`, `--grad-dark-card`) are reserved for active navigation, primary buttons, the hero chart panel, avatars, and illustrations.
- Elevation: `--shadow-xs … --shadow-lg`, `--shadow-glow`, plus `--inner-highlight`. Glass: `--glass-bg`, `--glass-strong`, `--glass-blur`.
- Shape: radii 8/12/16/20/24px; cards use 20px, hero panels 24px. Spacing on a 4px scale (`--space-*`).
- Type: Plus Jakarta Sans Variable for UI and numerals (tabular figures); IBM Plex Mono only for logs and code.
- Components: `Card` (surface / glass / hero, optional `tilt`), `Skeleton`, `ProgressRing`, `MiniBars`, `TrendBadge`, `Avatar` in `components/ui.tsx`; SVG illustrations (`GlassCube`, `BarStack`, `AgentOrb`, `ChatBubbles`, `DocStack`, `Prism`) in `components/Illustrations.tsx`; `useTilt` in `lib/useTilt.ts`.
- Motion: hover elevation, card tilt, chart and bar growth, message/bubble entrance, menu and dialog spring-in, slow ambient background drift. Everything decorative is disabled under `prefers-reduced-motion`, and tilt is disabled for touch pointers.
- Messaging: the Inbox (`/app/inbox`) presents real notifications as conversations grouped by channel (completed, failed, needs review, workspace). The execution page renders the live SSE log as an agent conversation. There is no user-to-user chat backend; do not add composers that imply one.

## Surface brief: authenticated application

Mode: Operate. Users configure projects, run marketing workflows, inspect AI and crawl results, and prepare deliverables. Critical states are empty workspace, pending configuration, queued/running/failed/completed execution, incomplete score coverage, and unavailable external data. Every metric comes from the API and each AI-generated recommendation carries its source distinction.
