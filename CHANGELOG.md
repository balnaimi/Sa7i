# Changelog

All notable changes to Sa7i are documented here.

Sa7i follows semantic versioning: `MAJOR.MINOR.PATCH`.

## [0.5.0] - 2026-06-24

### Changed
- Redesigned the authenticated home screen into two primary cards: `الأصدقاء` and `القروبات`.
- Moved friend adding/requests and group creation/invitations into grouped settings sections.
- Simplified top navigation to `الرئيسية`, `التنبيهات`, and `الإعدادات` for a cleaner app-like flow.
- Polished the groups view to focus only on active groups and their member states.

### Added
- Admin crown badges on groups and creator member cards so group owners are obvious.

## [0.4.0] - 2026-06-24

### Added
- Group invitations: added friends must accept or reject before entering a group, including invitations sent later by the creator.
- Neutral group state so members can clear their previous `صح` / `لا` choice back to `بدون قرار`.
- Group membership controls: members can leave groups, and group creators can remove other members.
- Friend removal from the friends list.

### Changed
- Redesigned the groups area into `قروباتي`, `إنشاء قروب`, and `دعوات القروبات` tabs to keep long lists contained.
- Compressed the friends list into expandable rows with contextual actions instead of always-visible edit controls.
- Made group wording generic for any topic instead of attendance-only language.

## [0.3.2] - 2026-06-24

### Fixed
- Fixed group loading by explicitly embedding member profiles through `group_members.profile_id` when Supabase sees multiple relationships to `profiles`.

## [0.3.1] - 2026-06-24

### Security
- Moved group RLS helper functions to a private schema so they are not exposed as public Supabase RPC endpoints.
- Added a migration to drop the old public group helper functions after policy references are moved.

## [0.3.0] - 2026-06-24

### Added
- Topical groups so a user can create a named event/topic and add accepted friends.
- Group member dashboard with one card per member and clear yes/no/pending visual states.
- Per-member group response controls using the same professional check/X visual language.
- Supabase tables, indexes, realtime publication setup, and RLS policies for groups and group members.

### Changed
- README now lists group status cards as a core app capability.

## [0.2.0] - 2026-06-24

### Added
- Friend invite codes and per-user friend display labels.
- Ability to rename accepted friends from the friends list.
- Missed alerts list and quick reply state handling.
- PWA push notification support, notification preferences, quiet hours, and per-device mute settings.
- Professional check/X reply icons instead of raw emoji in the main UI.

### Changed
- Polished RTL Arabic UI layout and centered the main/login experience.
- Improved local bootstrap behavior so unavailable Supabase auth does not leave the app stuck on loading.
- Kept public repository documentation concise while documenting required environment variables.

### Fixed
- Mobile main button centering and selected-friend refresh behavior.
- Duplicate SQL setup between the base schema and migrations.

## [0.1.0] - 2026-06-23

### Added
- Initial Sa7i prototype with one-button wake signal flow between friends.
- Supabase schema and Next.js/Tailwind PWA foundation.
