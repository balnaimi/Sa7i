# Sa7i / صاحي

تطبيق PWA بسيط جداً: تضيف صديق، وإذا ضغطت زر `صاحي ؟` يصله تنبيه صوتي داخل التطبيق، وردّه الوحيد يكون `صاحي..`.

## التقنية

- Next.js 16 + React 19
- TypeScript
- Tailwind CSS
- Supabase Auth + Postgres + Realtime
- Vercel deployment
- PWA manifest + Service Worker بسيط

## التشغيل السريع

```bash
npm install
cp .env.example .env.local
npm run dev
```

املأ `.env.local` بقيم Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
```

## Supabase

شغّل ملف SQL:

```text
supabase/schema.sql
```

من Supabase Dashboard → SQL Editor.

## التوثيق

- [الفكرة والنطاق](docs/01-idea-and-scope.md)
- [إعداد Supabase](docs/02-supabase-setup.md)
- [النشر على Vercel](docs/03-vercel-deployment.md)
- [التشغيل المحلي](docs/04-local-development.md)

## ملاحظة مهمة

هذه نسخة Prototype تعليمية. إشعارات الخلفية الحقيقية على الجوال تحتاج مرحلة ثانية باستخدام Push Notifications، أما النسخة الحالية فتعطي صوت وتنبيه عندما التطبيق مفتوح/نشط.
