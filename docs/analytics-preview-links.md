# Analytics preview directory

Start at the [Preview library](http://127.0.0.1:3001/admin/preview-library). It links 34 current/earlier pages and report views, plus six frozen comparison links in local development. Staff sign-in is required. Earlier reports are sample-only; workspace 04 explicitly separates Sample and GA4 modes, with no sample fallback when reporting is unconfigured. The campaign builder is a local tool independent of reporting filters.

## Current workspace · version 04

| Page | State | Local link |
| --- | --- | --- |
| Overview | Guide and implementation map | [Open](http://127.0.0.1:3001/admin/analytics-workbench/overview) |
| Pages & audience | Coded core · sample / configured GA4 | [Open](http://127.0.0.1:3001/admin/analytics-workbench/pages) |
| Audience technology | Devices, operating systems, browsers and brands | [Open](http://127.0.0.1:3001/admin/analytics-workbench/pages?view=audience) |
| Event & region content | Content views, selected regions and event × region | [Open](http://127.0.0.1:3001/admin/analytics-workbench/pages?view=content) |
| Acquisition | Coded core · sources, campaigns, landing pages, link builder, analysis log | [Open](http://127.0.0.1:3001/admin/analytics-workbench/acquisition) |
| Campaign link builder | Top-level Campaigns menu · validation, presets, browser-local saved links and CSV | [Open](http://127.0.0.1:3001/admin/campaigns) |
| Feature discovery | Lightweight exposure/use signal report · live verification pending | [Open](http://127.0.0.1:3001/admin/analytics-workbench/features) |
| Journeys | Fixed ordered user funnels · Google verification pending | [Open](http://127.0.0.1:3001/admin/analytics-workbench/journeys) |
| Retention | Six complete starting groups · recognition limits disclosed | [Open](http://127.0.0.1:3001/admin/analytics-workbench/retention) |
| Feedback & issues | Account-only public form and staff inbox | [Open](http://127.0.0.1:3001/admin/analytics-workbench/feedback) |
| Release impact | Implemented descriptive before/after comparison · live verification pending | [Open](http://127.0.0.1:3001/admin/analytics-workbench/releases) |
| Experiments | Saved plans, sample estimate and results worksheet · no delivery | [Open](http://127.0.0.1:3001/admin/analytics-workbench/experiments) |
| Measurement | Coded core · protected setup status, definitions and QA | [Open](http://127.0.0.1:3001/admin/analytics-workbench/measurement) |

See [the October 25 continuation](analytics-completion-2026-10-25.md), [workspace 04 before/after links](analytics-workbench-v4.md) and [the deployment checklist](analytics-deployment.md). All nine areas now contain local implementation, with different scopes: reporting, feedback or experiment planning. This does not mean all are live or that A/B delivery exists. No Google reporting credentials were supplied or account access verified. Feature discovery does not yet calculate eligible-session or same-visit conversion rates.

The library also includes six frozen before-version links in local development
(40 destinations including the 34 current/earlier views). The
[saved before-version Pages report](http://127.0.0.1:3001/admin/analytics-before/analytics-workbench/pages?mode=sample&days=28&device=all)
freezes the pre-redesign UI. It uses the normal staff session and does not freeze
the API or browser-local notes. It is excluded from production builds.

## Earlier coherent workspace · concept 02

| Page | Question | Local link |
| --- | --- | --- |
| Summary | What needs attention? | [Open](http://127.0.0.1:3001/admin/analytics/summary) |
| Pages & audience | Which pages/events/regions are viewed, on what devices and from which channels? | [Open](http://127.0.0.1:3001/admin/analytics/pages) |
| Acquisition | Which sources, campaigns and landing pages bring visits that lead to useful activity? | [Open](http://127.0.0.1:3001/admin/analytics/acquisition) |
| Features | Were controls exposed, and were they used? | [Open](http://127.0.0.1:3001/admin/analytics/features) |
| Journeys | Where do ordered tasks stop, and which page paths are common? | [Open](http://127.0.0.1:3001/admin/analytics/journeys) |
| Retention | Did eligible cohorts return in later completed weeks? | [Open](http://127.0.0.1:3001/admin/analytics/retention) |
| Feedback & issues | What did visitors report, in which page/event/region/snapshot context? | [Open](http://127.0.0.1:3001/admin/analytics/feedback) |
| Experiments | What could we test, and how would we judge the result? | [Open](http://127.0.0.1:3001/admin/analytics/experiments) |
| Settings & measurement | Which sources, metric definitions and tracking checks support the reports? | [Open](http://127.0.0.1:3001/admin/analytics/settings) |

## Earlier analytics layouts · preserved

- [Earlier feature-discovery concept](http://127.0.0.1:3001/admin/analytics-feature-concept) — sample eligible → exposed → used layout, preserved separately from the lightweight report.
- [Overview](http://127.0.0.1:3001/admin/ux-analytics?tab=overview)
- [Journeys](http://127.0.0.1:3001/admin/ux-analytics?tab=journeys)
- [Feature usage](http://127.0.0.1:3001/admin/ux-analytics?tab=features)
- [GA4 setup](http://127.0.0.1:3001/admin/ux-analytics?tab=setup)
- [Experiments](http://127.0.0.1:3001/admin/experiments)

## Earlier UX examples · preserved

- [All UX examples](http://127.0.0.1:3001/admin/ux-examples)
- [Audience](http://127.0.0.1:3001/admin/ux-examples/audience)
- [Retention](http://127.0.0.1:3001/admin/ux-examples/retention)
- [Usability studies](http://127.0.0.1:3001/admin/ux-examples/usability) — deferred, not a requirement for the new workflow.
- [Feedback](http://127.0.0.1:3001/admin/ux-examples/feedback)
- [Experience quality](http://127.0.0.1:3001/admin/ux-examples/quality)

The earlier content files are unchanged. The staff shell now has one Analytics entry and a Preview library instead of three competing analytics/research entries. Git stash backups `4cc17d621d59b3ec520336ab49f8efbbce427806` (earlier previews) and `2343215beae1cc35cbd64549c95999ae9f556696` (GA4 collection) are retained. Do not blindly apply them again over their already-restored files.

See [the information architecture and scope notes](analytics-workspace-v2.md) for design decisions and future implementation boundaries. No live integration, public form, experiment delivery, password reset or deployment was performed for concept 02.
