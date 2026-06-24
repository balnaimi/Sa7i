# Sa7i

Sa7i is a simple Arabic-first PWA for sending a one-button signal between accepted friends.

- Friends are added with a private invite code, not by username.
- Main signal: `صاحي ؟`
- Reply signal: `صاحي..`
- Optional PWA push notifications with quiet hours and per-device mute settings.
- App-like home with separate Friends and Groups sections, plus grouped settings for invites and preferences.
- Built with Next.js, React, TypeScript, Tailwind CSS, and Supabase.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required app environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
```

For a new Supabase project, run `supabase/schema.sql` in the SQL editor. For an existing project, apply the files in `supabase/migrations/` in order.

The `send-signal-push` Supabase Edge Function also needs server-side secrets in Supabase, not in the public app env:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
```

## Versioning

Sa7i uses semantic versioning: `MAJOR.MINOR.PATCH`. See `CHANGELOG.md` for release notes.

## Status

Prototype.
