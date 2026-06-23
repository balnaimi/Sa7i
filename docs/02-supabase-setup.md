# إعداد Supabase خطوة بخطوة

## 1) إنشاء مشروع

1. افتح https://supabase.com
2. ادخل على Dashboard.
3. اضغط **New project**.
4. اختر Organization.
5. اكتب اسم المشروع مثلاً: `sa7i`.
6. اختر كلمة مرور قاعدة البيانات واحفظها عندك.
7. اختر Region قريب منك.
8. اضغط **Create new project**.

## 2) إعداد Auth للتجربة

لأن التطبيق يستخدم username وليس email حقيقي:

1. من Supabase Dashboard افتح مشروع Sa7i.
2. افتح **Authentication**.
3. افتح **Sign In / Providers**.
4. اختر **Email**.
5. للتجربة الأولى عطّل **Confirm email**.
6. احفظ.

> لاحقاً إذا بنحوّل التطبيق لإنتاج حقيقي، نراجع موضوع البريد والتأكيد أو نضيف تسجيل دخول برقم الجوال/SSO.

## 3) تشغيل SQL Schema

إذا هذا مشروع جديد تماماً، شغّل:

```text
supabase/schema.sql
```

إذا سبق شغلت النسخة القديمة قبل إضافة كود الإضافة، شغّل ملف التحديث أولاً:

```text
supabase/migrations/20260623_invite_codes.sql
```

ثم تقدر تعيد تشغيل `supabase/schema.sql` إذا احتجت.

1. افتح **SQL Editor**.
2. اضغط **New query**.
3. انسخ محتوى الملف المطلوب.
4. اضغط **Run**.

الجداول التي تنشأ:

| الجدول | وظيفته |
|---|---|
| `profiles` | اسم المستخدم والاسم الظاهر وكود الإضافة الخاص بكل مستخدم |
| `friendships` | طلبات الصداقة وحالتها |
| `wake_signals` | تنبيهات صاحي بين الأصدقاء |

## 4) أخذ مفاتيح الربط

1. اضغط زر **Connect** في أعلى مشروع Supabase.
2. اختر App Framework أو API Keys.
3. خذ القيم التالية:
   - Project URL
   - Publishable key `sb_publishable_...`

ضعها في ملف `.env.local` محلياً:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxx
```

## 5) تفعيل Realtime

ملف `schema.sql` يحاول تفعيل Realtime على جدول `wake_signals` تلقائياً:

```sql
alter publication supabase_realtime add table public.wake_signals;
```

إذا ظهر خطأ أن الجدول مضاف مسبقاً، تجاهله.
