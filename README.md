# Parking Management System · نظام إدارة الباركينج

نظام لإدارة مواقف مبنى تجاري (بدرومين + أرضي + ميزانين + أدوار + ساحة خارجية) — بديل لملف
`PARKING STATEMENT.xlsx`. خرائط تفاعلية مستخرجة من ملفات AutoCAD، مستأجرون، عقود سنوية، تذكيرات
تلقائية، لوحة تحكم، تقارير Excel/PDF، واستيراد من الإكسل الحالي مع معاينة وتقرير أخطاء.

**تطبيق Next.js واحد (Full-Stack):** الواجهة في `src/app`، والـ Backend كله داخل `src/app/api` (Route Handlers)
— جاهز للرفع على **Vercel** مباشرة بدون أي سيرفر منفصل.

| | |
|---|---|
| **App** | Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · TanStack Query · react-zoom-pan-pinch · Recharts |
| **API** | `src/app/api/[...path]/route.ts` → `src/server` (Zod validation · roles · Pino logs · Swagger/OpenAPI 3) |
| **Database** | PostgreSQL (محلي / Docker / Supabase) · Prisma ORM (migrations + seed من بيانات الإكسل الفعلية) |
| **Auth** | JWT (access 15m + refresh rotation، httpOnly cookies) · أدوار ADMIN / OWNER / STAFF |
| **Jobs** | Vercel Cron يومياً → `/api/cron/reminders` (أو scheduler داخلي عند الاستضافة الذاتية) |
| **UI** | عربي/إنجليزي (RTL/LTR) · Dark/Light/System · Responsive (موبايل) |

---

## 1) التشغيل المحلي

المتطلبات: **Node.js ≥ 20** و **PostgreSQL** (Docker *أو* PostgreSQL مثبت *أو* Supabase).

```bash
npm install
cp .env.example .env          # ثم عدّل القيم (DATABASE_URL / JWT secrets / SMTP)
```

**قاعدة البيانات — اختر واحدة:**

```bash
npm run db:up                 # Docker: Postgres على 5434 + Mailpit (http://localhost:8025)
```

```bash
npm run db:local:init         # بدون Docker: cluster محلي في ./.pgdata على 5434 من PostgreSQL المثبت
```

**Migrations + Seed** (طوابق + أماكن من الـ DWG + مستخدمين + استيراد الإكسل الفعلي):

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

**التشغيل:**

```bash
npm run dev                   # http://localhost:3000  ·  توثيق الـ API: http://localhost:3000/api/docs
```

حسابات التطوير من `SEED_*` في `.env` (ADMIN / OWNER / STAFF) — **غيّر كلمات المرور في الإنتاج**.

**الاختبارات** (27 اختبار للـ endpoints المهمة — تعمل على قاعدة **محلية** فقط لأنها تمسح الجداول):

```bash
npm test
```

---

## 2) الرفع على Vercel

1. ارفع المشروع على GitHub ثم **Import** في Vercel (الإطار: Next.js — يُكتشف تلقائياً، و`vercel.json` جاهز).
2. أضف **Environment Variables** في Vercel:

   | المتغير | القيمة |
   |---|---|
   | `DATABASE_URL` | رابط Supabase (Pooler) مثل `postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require` |
   | `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | قيمتين عشوائيتين (≥ 32 حرف) |
   | `CRON_SECRET` | قيمة عشوائية — Vercel يرسلها تلقائياً لمهمة التذكير اليومية |
   | `TZ_NAME` | `Asia/Riyadh` |
   | `EMAIL_ENABLED` + `SMTP_*` + `MAIL_FROM` | بيانات مزود البريد (Resend / SendGrid / Gmail SMTP…) |

3. **Deploy.** أمر البناء (`npm run vercel-build`) يشغّل `prisma generate` و `prisma migrate deploy` تلقائياً ثم `next build`.
4. **مرة واحدة فقط** لملء البيانات (طوابق، أماكن، مستخدمين، استيراد الإكسل) — من جهازك على نفس `DATABASE_URL`:

   ```bash
   npm run db:seed
   ```

5. التذكيرات: `vercel.json` يجدول `GET /api/cron/reminders` يومياً 05:00 UTC (08:00 الرياض). يمكن تشغيلها يدوياً من صفحة الإشعارات.

> ملاحظات: الـ API كله Route Handler واحد (`runtime: nodejs`, `maxDuration: 60s`).
> **حد رفع الملفات على Vercel = 4.5 MB لكل طلب**، وملف `PARKING STATEMENT` الحالي حجمه **6.5 MB**، فرفعه من صفحة
> الاستيراد على Vercel سيُرفض. البدائل: الاستيراد الأولي يتم بـ `npm run db:seed` من جهازك (الخطوة 4)، أو افتح الملف في Excel
> واحفظه باسم جديد بعد حذف الصفوف/التنسيقات الفارغة ليصغر حجمه. محلياً أو على استضافة ذاتية الحد 25 MB.

---

## 3) هيكل المشروع

```
parking-management-system/
├─ src/
│  ├─ app/
│  │  ├─ api/[...path]/route.ts   ← كل الـ REST API (Next.js Route Handler)
│  │  ├─ (app)/                   ← dashboard · floors/[code] · tenants · contracts · imports · reports · notifications · settings
│  │  ├─ login/  print/           ← تسجيل الدخول · صفحة الطباعة (PDF)
│  │  └─ layout.tsx · globals.css
│  ├─ server/                     ← الـ Backend (لا يُرسل للمتصفح)
│  │  ├─ handler.ts               ← dispatcher: routing · body/multipart · errors · logs · Swagger
│  │  ├─ routes.ts                ← تسجيل كل الموديولات
│  │  ├─ lib/                     ← env · prisma · route (zod + roles + OpenAPI) · http · errors · dates · settings · audit · rate-limit
│  │  ├─ middleware/auth.ts       ← JWT + الصلاحيات
│  │  └─ modules/                 ← auth · users · floors/spots · tenants · contracts · dashboard · reports · settings
│  │     ├─ import/               ← parser (PARKING STATEMENT) · preview/commit
│  │     └─ notifications/        ← channels (Email / WhatsApp / SMS) · reminders · scheduler · cron
│  ├─ components/  lib/           ← واجهة: UI · الخريطة · i18n · API client
│  ├─ middleware.ts               ← حماية الصفحات (redirect لـ /login)
│  └─ instrumentation.ts          ← scheduler عند الاستضافة الذاتية فقط
├─ prisma/                        ← schema · migrations · seed.ts · data/floors/*.json (أماكن من DWG)
├─ public/floors/*.svg            ← مخططات الطوابق المستخرجة من DWG
├─ tests/                         ← Vitest (auth · contracts · reminders · import)
├─ tools/dwg-extract/             ← تحويل DWG → SVG + JSON (خطوة offline)
├─ docs/                          ← client-assets (نسخة الأصول) · ASSETS_REPORT.md · DATABASE.md
├─ vercel.json · docker-compose.yml · .env.example
```

---

## 4) المزايا

### خرائط تفاعلية (من ملفات DWG)
- صفحة لكل طابق: **B2 · B1 · GF · MF · 1F (VIP) · 2F · YARD · SHADED** مع تنقل سريع.
- كل مكان **Clickable**: الحالة، المستأجر، رقم العقد، البداية/الانتهاء، الأيام المتبقية، نوع الإيجار، والسجل التاريخي.
- ألوان: 🟢 متاح · 🔵 مؤجّر · 🟠 قارب على الانتهاء · 🔴 منتهي · ⚪ خارج الخدمة — مع فلترة وبحث.
- Zoom / Pan / Pinch، اختيار عدة أماكن → إنشاء عقد، و**محرر المخطط** (نقل/تدوير/إزالة/وضع الأماكن).

### المستأجرون والعقود
- بيانات المكتب وجهات اتصال متعددة، **حد أدنى مكانين** (الاستثناء بصلاحية ADMIN/OWNER).
- عقد سنوي تلقائي، أماكن مرقّمة + كميات بدون أرقام، منع تأجير مكان في عقدين متداخلين.
- تجديد (مع نسبة زيادة) · إنهاء · سجل تاريخي لكل مكان · Audit log.

### الإشعارات
- قواعد 60 / 30 / 7 يوم (قابلة للتعديل)، للمالك والمستأجر، داخل النظام + Email، وواجهة جاهزة لـ WhatsApp/SMS.
- Idempotent، يحوّل العقود المتأخرة لـ"منتهي"، وسجل إرسال كامل.

### لوحة التحكم والتقارير والاستيراد
- الإشغال (إجمالي وحسب الطابق)، الشاغر، القريب من الانتهاء، الإيرادات، مخطط 12 شهر، تنبيهات.
- Excel (عربي/إنجليزي) + PDF عبر صفحة الطباعة.
- استيراد `PARKING STATEMENT.xlsx` مع معاينة وتقرير أخطاء قبل الحفظ.

---

## 5) قرارات وافتراضات (قابلة للتعديل)

تفاصيلها في [docs/ASSETS_REPORT.md](docs/ASSETS_REPORT.md):
- **VIP = الدور الأول (1F)**، و**الخارجي المظلل** = `SHADED` (شبكة مقاعد)، و`final parking.dwg` = `YARD`.
- لا توجد أسعار ولا تواريخ عقود في الملف ← العقود المستوردة تبدأ بتاريخ الاستيراد لمدة سنة بالتعرفة الافتراضية ومعلّمة **"تحتاج مراجعة"**.
- "مواقف مع الوحدة المكتبية" = `INCLUDED`، و"المواقف المستأجرة" = `PAID`.
- تعارض نفس المكان بين مستأجرين: الأول في الشيت يحتفظ به، والتعارض يظهر في تقرير الاستيراد.

---

## 6) إعادة توليد المخططات من DWG

```bash
npm run dwg:extract
```

يقرأ من `docs/client-assets/` ويكتب `public/floors/*.svg` و `prisma/data/floors/*.json` (ثم `npm run db:seed`).
الأداة تستخدم `@mlightcad/libredwg-web` (GPL-3.0) كخطوة offline فقط ولا تدخل في التطبيق المنشور.

---

## 7) الـ API

كل الـ endpoints موثقة في Swagger على `/api/docs` (JSON: `/api/docs.json`). أمثلة:

| Method | Path | الوصف |
|---|---|---|
| POST | `/api/auth/login` · `/refresh` · `/logout` | الدخول وتدوير التوكن |
| GET | `/api/floors` · `/api/floors/:code` | الطوابق والخريطة بالحالة الحيّة |
| GET/PATCH | `/api/spots/:id` · PUT `/api/spots/geometry/bulk` | تفاصيل المكان وسجله · حفظ المخطط |
| CRUD | `/api/tenants` · `/api/tenants/:id/contacts` | المستأجرون وجهات الاتصال |
| CRUD | `/api/contracts` · POST `/:id/renew` · `/:id/terminate` | العقود |
| GET | `/api/dashboard` | مؤشرات لوحة التحكم |
| GET | `/api/reports/{spots,contracts,tenants,occupancy}.xlsx` | التقارير |
| POST | `/api/imports/preview` · `/:id/commit` | الاستيراد |
| GET/POST | `/api/notifications` · `/rules` · `/run` · `/deliveries` | الإشعارات والقواعد |
| GET | `/api/cron/reminders` | مهمة التذكير اليومية (Vercel Cron + `CRON_SECRET`) |
