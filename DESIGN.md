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

## Tokens

- Light canvas: `#F5F6F7`; surface: `#FFFFFF`; ink: `#17212B`; secondary ink: `#53616E`; rule: `#D9DEE4`.
- Primary action and selection: `#344FC4`; subtle selection: `#E9EDFF`; confirmed: `#1B6D4A`; caution: `#805500`; error: `#A3312B`.
- Dark canvas: `#11161B`; surface: `#1A2229`; ink: `#F2F5F7`; secondary ink: `#B6C0C9`; rule: `#3A454F`; primary: `#A7B6FF`.
- UI type: IBM Plex Sans Variable. Measurement and code: IBM Plex Mono. Self-host both through Fontsource.
- Spacing follows a 4px base. Page gutters grow from 20px on mobile to 40px on wide screens. Compact controls use 8px radii; major work surfaces use 12px radii.
- Use a single 1px rule for separation. Elevation appears only on transient menus and dialogs, with a soft offset shadow.
- Motion is limited to a short sidebar/drawer transition and live execution state changes. Content stays visible by default.

## Surface brief: authenticated application

Mode: Operate. Users configure projects, run marketing workflows, inspect AI and crawl results, and prepare deliverables. Critical states are empty workspace, pending configuration, queued/running/failed/completed execution, incomplete score coverage, and unavailable external data. Every metric comes from the API and each AI-generated recommendation carries its source distinction.
