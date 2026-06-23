# نشر Sa7i على Vercel

## 1) ربط الريبو

1. افتح https://vercel.com
2. اختر **Add New... → Project**.
3. اختر GitHub repo:

```text
github.com/balnaimi/Sa7i
```

4. Vercel بيتعرف على Next.js تلقائياً.

## 2) Environment Variables

قبل أول Deploy أضف:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | رابط مشروع Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key من Supabase |

## 3) Build Settings

عادة ما تحتاج تغير شيء:

| الإعداد | القيمة |
|---|---|
| Framework Preset | Next.js |
| Build Command | `npm run build` |
| Install Command | `npm install` |
| Output Directory | يترك فارغ |

## 4) بعد النشر

Vercel يعطيك رابط HTTPS تلقائياً مثل:

```text
https://sa7i.vercel.app
```

بعدها تقدر تضيف دومينك من:

```text
Project → Settings → Domains
```

## 5) ملاحظات PWA

- PWA يحتاج HTTPS، وهذا Vercel يوفره تلقائياً.
- من الجوال افتح الرابط ثم Add to Home Screen.
- النسخة الحالية تعمل Offline جزئياً للواجهة، لكن التنبيهات تحتاج اتصال لأنها عبر Supabase Realtime.
