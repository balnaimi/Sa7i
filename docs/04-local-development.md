# تشغيل Sa7i محلياً

## المتطلبات

- Node.js 22 أو أحدث.
- npm.
- حساب Supabase.

## الخطوات

```bash
git clone https://github.com/balnaimi/Sa7i.git
cd Sa7i
npm install
cp .env.example .env.local
```

عدّل `.env.local` وحط قيم Supabase.

ثم شغّل:

```bash
npm run dev
```

افتح:

```text
http://localhost:3000
```

## تجربة مستخدمين

لأن الصداقة تحتاج طرفين:

1. افتح المتصفح العادي وسجل مستخدم: `anas`.
2. افتح نافذة Incognito وسجل مستخدم ثاني: `test`.
3. من `anas` انسخ كود الإضافة الظاهر في البطاقة.
4. من `test` أضف كود `anas` أو العكس.
5. الطرف الثاني يقبل الطلب من **طلبات واردة**.
6. من `anas` اختر `test` واضغط `صاحي ؟`.
7. في نافذة `test` بيطلع التنبيه والصوت.
8. إذا فتح `test` صفحة `anas` بيشوف الزر `صاحي..` للرد.
