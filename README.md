# ⚡ Opencode Productivity Plugins

> Two tiny plugins that make parallel AI coding safe and docs always fresh.

[![Opencode Plugin](https://img.shields.io/badge/opencode-plugin-blue)](https://opencode.ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 🎥 آموزش ویدیویی

دموی کامل نصب و کار با هر دو پلاگین رو توی یوتیوب ببین:

👉 **Watch on YouTube:** https://youtu.be/41v4mebHVXI


---

## 📦 پلاگین‌ها

| # | Plugin | File | کارش چیه؟ |
|---|--------|------|-----------|
| 1 | 🔄 Session Coordinator | `.opencode/plugins/session-coordinator.ts` | جلوگیری از تداخل چند سشن موازی با heartbeat و تشخیص overlap |
| 2 | 📚 Docs Structure Sync | `.opencode/plugins/docs-structure-sync.ts` | آپدیت خودکار `docs/PROJECT_STRUCTURE.md` از روی فایل‌سیستم واقعی |

---

## 1️⃣ 🔄 Session Coordinator

### ❓ مشکل

وقتی چند `opencode` رو همزمان اجرا می‌کنی، بدون خبر فایل‌های همدیگه رو خراب می‌کنن.

### ✅ راه‌حل

هر سشن با `pid + heartbeat + scope` ترک میشه. قبل از شروع کار `check_sessions` رو میزنی و اگه کس دیگه روی همون فایل‌ها کار کنه، وارنینگ می‌گیری.

### ✨ Features

- 📡 ترک خودکار با `session.created` / `session.deleted`
- 💓 آپدیت heartbeat روی هر `tool.execute.before`
- 🧹 پاک‌سازی خودکار سشن‌های stale بعد از 150 ثانیه
- ⚠️ تشخیص overlap scope ها با `includes()` matching
- 🔒 رایت اتمیک با `.tmp + rename` (خراب نشدن `sessions.json`)

### 🚀 Usage

```text
check_sessions
```

خروجی:

```text
• "Fix SMS channel" | 5s ago scope: [app/Services/Sms/]
• "Add login test" ← current | 2s ago scope: [tests/Feature/Auth/]
```

اول هر تسک خودت رو register کن:

```text
register_task(description="Fix SMS channel", scope="app/Services/Sms/, tests/Feature/Sms/")
```

اگه تداخل باشه:

```text
⚠️ Overlap: "Fix SMS channel" <-> "Refactor SMS" both cover "app/Services/Sms/"
```

### 🛠️ Tools

| Tool | Args | Description |
|------|------|-------------|
| `check_sessions` | — | لیست سشن‌های فعال + هشدار overlap |
| `register_task` | `description: string`, `scope: string` | معرفی کاری که الان انجام میدی |

### ⚙️ How it works

1. `session.created` → push `{ pid, title, branch, sessionID, lastHeartbeat }` به `.opencode/sessions.json`
2. `tool.execute.before` → آپدیت heartbeat + `cleanStale()`
3. `session.deleted` → حذف entry
4. `check_sessions` → مقایسه scope ها به صورت pairwise

---

## 2️⃣ 📚 Docs Structure Sync

### ❓ مشکل

دو روز بعد از تغییر ساختار پروژه، `PROJECT_STRUCTURE.md` قدیمیه. هیچکس دستی آپدیتش نمی‌کنه.

### ✅ راه‌حل

یه دستور کل درخت واقعی رو اسکن می‌کنه و فقط سکشن `## Directory Map` رو آپدیت می‌کنه — بدون دست زدن به Rules و کامنت‌های دستی تو.

### ✨ Features

- 🌳 اسکن واقعی: `app, bin, config, database, docs, plugins, resources, routes, stubs, tests`
- 📂 نمایش depth-2 هوشمند برای `app/`, `resources/`, `database/`, `tests/`, `bin/`, `routes/`
- 🔌 plugin-aware — هر `plugins/<Name>/` رو خودش لیست می‌کنه
- 💬 حفظ کامنت‌ها — کامنت‌های موجود اولویت دارن، بعد defaults
- ✂️ جایگزینی surgical — فقط بلاک Directory Map عوض میشه
- 🔒 رایت اتمیک با `.tmp + rename`

### 🚀 Usage

بعد از هر تغییر ساختاری:

```text
sync_project_structure
```

خروجی موفق:

```text
✅ docs/PROJECT_STRUCTURE.md updated (12 lines changed).
```

اگه آپدیت باشه:

```text
No changes needed — directory map is already up to date.
```

کی صدا بزن:

- [ ] دایرکتوری جدید ساختی
- [ ] پلاگین جدید اضافه کردی
- [ ] ریفکتور / جابجایی انجام دادی
- [ ] قبل از کامیت

### 🛠️ Tool

| Tool | Args | Description |
|------|------|-------------|
| `sync_project_structure` | — | اسکن درخت + آپدیت Directory Map با حفظ کامنت‌ها |

### ⚙️ How it works

1. خواندن `docs/PROJECT_STRUCTURE.md`
2. `parseExistingTree()` → استخراج `# comments` با regex
3. مرج با `getDefaultComments()` (مثل `app/Services → Business logic`)
4. `buildTree()` → درخت `├── / └──` مرتب
5. `replaceSection("## Directory Map")` → رایت‌بک

---

## 📥 Install (هر دو با هم)

```bash
# 1. کپی پلاگین‌ها
cp session-coordinator.ts .opencode/plugins/
cp docs-structure-sync.ts .opencode/plugins/

# 2. ری‌استارت opencode

# 3. تست
# check_sessions
# sync_project_structure
```

ساختار مورد انتظار:

```text
.opencode/
├── plugins/
│   ├── session-coordinator.ts
│   └── docs-structure-sync.ts
└── sessions.json  # auto-generated

docs/
└── PROJECT_STRUCTURE.md  # must have ## Directory Map section
```

## 📁 PROJECT_STRUCTURE.md Template

پلاگین دوم دنبال این سکشن می‌گرده:

```md
## Directory Map

```
core/
├── app/                    # Laravel core
├── plugins/                # Independent plugins
│   ├── Website/
...
```
```

اگه فایل وجود نداشته باشه، ارور `File not found` می‌گیری.

## 🔧 Requirements

- `opencode` latest
- `Node.js` + `@opencode-ai/plugin`
- `docs/PROJECT_STRUCTURE.md` با سکشن `## Directory Map`

## 📄 License

MIT
