<!-- Copyright (c) 2026 XynaxDev | Contact: akashkumar.cs27@gmail.com -->

# Changelog

All notable changes to UnivGPT are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Collapsible in-chat model reasoning view that preserves generated rationale separately from the final answer when providers emit explicit thinking blocks.
- Dedicated role-aware timetable workflows for both students and faculty, including daily dashboard previews, full agenda pages, and downloadable original timetable PDFs.

### Changed
- Chat answers, citations, and assistant routing are now more grounded in live UnivGPT scope data, with app-first guidance before sending users to external university systems.
- Dashboard timetable previews were simplified into stronger featured-slot cards and cleaner off-day states, while the course directory now paginates after six items.
- Google auth, session refresh handling, and profile-completion guidance were tightened so users stay in the correct role more reliably after login and refresh.

### Fixed
- Lightweight chat generation now avoids failing hard when providers leak reasoning before the final answer.
- Moderation escalation, notice routing, and exact citation jumps now behave more reliably across student, faculty, and admin surfaces.
- Account deletion, orphaned audit writes, and refresh-time session drops no longer leave users in broken auth states.

### Performance
- First-load dashboard and timetable fetches were trimmed, warm-cache reuse was expanded, and generation failover now moves off unhealthy providers faster.

## [0.12.0] - 2026-04-05

### Added
- Environment-driven model routing for intent, primary generation, and fallback generation providers, plus a local provider diagnostics script for intent/generation checks.
- Dedicated notice preview flow with role-aware attachment handling across notifications, served notices, and document-linked notice cards.
- Multi-audience document upload and notice targeting with shared multi-select controls and cleaner recipient selection UX.
- Date-based timetable experience for both faculty and students, including dedicated timetable pages, daily dashboard previews, official timetable PDF downloads, and live role-scoped timetable document surfacing.
- Holiday-aware timetable agenda states, mobile week navigation, themed month jump controls, and a stronger off-day/holiday experience on dashboard timetable previews.

### Changed
- Faculty and student dashboard timetable sections now focus on today's schedule, with full timetable detail moved into dedicated agenda pages.
- Timetable UI was rebuilt around A-D academic blocks, lunch placement, faculty metadata, and role-aware day agendas rather than the earlier dense sheet mockup.
- Shared select, tooltip, preview, and calendar controls were restyled to better match the dashboard theme across desktop and mobile.
- Profile, chat, and timetable banners received another pass for better action alignment, calmer gradients, and clearer hierarchy.
- Notice delivery and recipient flows now treat served notices as first-class objects instead of piggybacking on generic document preview behavior.

### Fixed
- Stale role fallback paths that could intermittently demote an admin session to student during auth bootstrap or callback hydration.
- Served-notice sender visibility, faculty notice sender resolution, and null uploader insert failures in faculty notice delivery.
- Notice attachment pickers incorrectly including previously served notice records instead of only real attachable documents.
- Protected document preview failures that surfaced raw unauthenticated JSON instead of resolving a viewable file stream.
- Leaked model planning text appearing in chat responses, dummy conversation UUID errors, and weak fallback handling when providers returned unusable reasoning output.
- Warm-cache regressions that were forcing repeated dashboard/timetable reloads, extra banner skeletons, or stale route refresh behavior while navigating between sections.

### Performance
- Reduced repeated route-level refetching by reusing warm cache more consistently across dashboards, timetable pages, notices, and profile-linked stats.
- Added safer generation failover with provider cooldowns and clearer downtime handling when primary or fallback models rate-limit or go temporarily unavailable.
- Improved perceived document/notice responsiveness with viewer-first previews, attachment-aware notice opens, and more targeted cache invalidation after delivery mutations.

## [0.11.0] - 2026-04-04

### Added
- Reusable skeleton loading system applied across dashboards, courses, faculty, users, notifications, uploads, and audit tables.
- Better recipient preview in admin broadcast workflow with richer per-user context.
- Root-level changelog for project-level release tracking.
- Account presence snapshot panel on profile pages with role-aware field emphasis.
- Stronger owner/profile media propagation in directory and admin list surfaces.

### Changed
- Profile and settings layouts were rebalanced for cleaner information hierarchy.
- Dropdown, filter, and tooltip interactions were standardized for consistency.
- Runtime configuration defaults and environment handling were cleaned up.
- Audit, users, and dean pages now use more consistent loading/sync states.
- Filter bars and select controls aligned for cleaner desktop and mobile scanability.

### Fixed
- Chat/session isolation issues between student, faculty, and admin contexts.
- Avatar/name propagation mismatches across directories and list views.
- Dean appeals review page state flow and refresh behavior.
- Multiple role-route leakage paths for admin-only actions and screens.
- Notification preview and role visibility mismatches across dashboard contexts.

### Performance
- Added stale-while-revalidate style client caching to cut repeated fetch cost.
- Improved sync-state behavior on paginated tables during refresh/navigation.
- Reduced redundant re-querying while switching tabs/routes within dashboards.
- Improved perceived speed using skeletons instead of stale/frozen table rows.

## [0.10.0] - 2026-04-03

### Added
- Moderation appeal review flow with admin/dean actions.
- Admin user activity report broadcast pipeline with recipient preview.
- Role-scoped document notification preview support.
- Recipient activity metrics (query count, active days, account age, last activity) in admin broadcast workflow.
- Dynamic in-app notice surfacing for moderation and governance events.

### Changed
- Assistant pipeline was modularized into cleaner intent/moderation/snapshot services.
- Admin and dashboard UX received major polish (cards, tables, controls, interaction cues).
- Upload console and operational admin pages were redesigned for better usability.
- Email templates were reformatted for cleaner readability and timestamp clarity.
- Chart/summary cards across admin pages were tuned for responsive rendering behavior.

### Fixed
- Cross-role data exposure risks in admin-only pages and actions.
- Conversation ownership boundaries (user + role scoping).
- Auth edge cases (forgot-password/provider mismatch handling).
- Per-page `per_page` handling and API clamps that previously caused hard failures.
- Notification navigation and view-all behavior inconsistencies.

### Performance
- Backend pagination guardrails and audit pruning improved stability at scale.
- Frontend defaults tuned for faster initial render on data-heavy screens.
- Reduced noisy/log-heavy patterns in admin activity pipelines.
- Improved list APIs by capping expensive queries and shrinking default page footprints.

## [0.9.0] - 2026-04-02

### Added
- Dedicated faculty directory/profile experience with mapped course context.
- Pagination across users, notifications, uploads, and dean appeals queues.
- Shared Radix-based filter/select controls in major dashboard flows.
- Report notice controls on users page with preview-before-send workflow.
- Improved tooltip foundation reused across navigation, cards, and action surfaces.

### Changed
- Product naming standardized to **UnivGPT** across prompts and UI.
- Profile/settings upgraded with role-specific field presentation.
- Seed/demo workflow improved for realistic local role testing.
- Dashboard hero blocks and role pages refactored for stronger hierarchy and cleaner CTA placement.
- Faculty and course cross-navigation flow stabilized to avoid dead-end redirects.

### Fixed
- Sidebar/mobile navigation stability and active-state jitter.
- Topbar notification view-all and related navigation behavior.
- Session persistence/logout reliability issues.
- Upload empty states showing incorrect guidance for role-scoped users.
- Notification dropdown clipping and scroll behavior.

## [0.8.0] - 2026-03-06

### Added
- OTP signup verification, resend flow, and stronger auth lifecycle controls.
- Role-aware assistant routing for faculty/course/document queries.
- Moderation flow with warnings, escalation, block state, and appeal submission.
- End-to-end ingestion pipeline (extract -> chunk -> embed -> vector index).
- Structured role-mode assistant behavior for student/faculty/admin response scopes.
- Appeals lifecycle APIs for approve/reject/reset and audit-linked moderation events.

### Changed
- Shifted toward model-driven moderation and intent routing with safer fallbacks.
- Improved auth/profile sync and role-safe API boundaries.
- Moved from hardcoded response paths to intent-first and context-first assistant handling.
- Improved migration/runtime setup for safer schema evolution on live Supabase projects.

### Fixed
- Timeout/fallback behavior for provider instability.
- Early auth/profile consistency issues across backend and frontend.
- Better handling for provider rate limits and transient upstream failures.
- Hardened SMTP delivery and surfaced actionable failure points.

## [0.7.0] - 2026-03-05

### Added
- Google + email auth flow hardening with better UX continuity between signup/login/verify.
- Query-access governance controls tied to profile and role metadata.
- Initial private setup guides for auth/provider environment configuration.

### Changed
- Migration scripts updated to support env-driven behavior for new deployments.
- Upload and ingestion metadata routing expanded for role + audience classification.

### Fixed
- Profile image/session persistence issues after logout/login cycles.
- Multiple onboarding and callback flow errors in auth redirect handling.

## [0.6.0] - 2026-03-04

### Added
- Faculty/course demo directory bootstrap and seed/reset utility improvements.
- Admin audit/log visibility improvements with clearer type segmentation.
- Initial dean moderation desk UI and supporting operational controls.

### Changed
- Main dashboard layouts reworked for stronger section organization and readability.
- Settings/profile pages redesigned to match the broader role-dashboard language.

### Fixed
- Route mismatches between course cards and faculty profile pages.
- Chat panel/input edge behavior and hover-state inconsistencies.

## [0.5.0] - 2026-03-03

### Added
- Course directory enhancements: filters, view controls, faculty mapping displays.
- Better role-tailored dashboards for student/faculty/admin use cases.
- Notification and activity feeds wired into more pages and role flows.

### Performance
- Reduced query footprints for document/course/faculty list retrieval.
- Lowered repeated fetch loops in frontend role pages.

### Fixed
- Frontend role-page loading stalls and timeout-prone data-fetch patterns.

## [0.4.0] - 2026-03-02

### Added
- Backend ingestion reliability updates and embedding metadata safeguards.
- Improved document processing + vector index integration stability.
- Better admin assistant operational context for governance queries.

### Changed
- Runtime defaults and environment scaffolding aligned for local + hosted use.
- Backend dependency and tunnel configuration cleanups.

## [0.1.0] - 2026-03-01

### Added
- Initial UnivGPT codebase bootstrap.
- Base backend/frontend structure, docs scaffold, and local setup flow.
- First pass on role-oriented university assistant direction.
