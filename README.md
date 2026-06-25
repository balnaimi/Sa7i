# شالترتيب!؟

Arabic-first PWA for organizing groups, appointments, trip plans, attendance, and qutiyyah contributions without mixing the plan into chat messages.

- Friends are added with a private invite code.
- Groups can be `ترتيب` for yes/no/notes coordination or `قطيّة` for contribution tracking.
- Public group links are readable by anyone; only members can edit their own card.
- Private groups are visible only to members.
- Group admins can invite/remove members, rename members inside the group, update all statuses, and assign qutiyyah managers.
- Qutiyyah managers can update contribution amounts.
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
```

For a new Supabase project, run `supabase/schema.sql` in the SQL editor. For an existing project, apply the files in `supabase/migrations/` in order.

## Versioning

شالترتيب!؟ uses semantic versioning: `MAJOR.MINOR.PATCH`. See `CHANGELOG.md` for release notes.

## Status

Prototype.
