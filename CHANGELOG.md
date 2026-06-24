# Changelog

All notable changes to Sa7i are documented here.

Sa7i follows semantic versioning: `MAJOR.MINOR.PATCH`.

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
