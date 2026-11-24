# Plan: Multi-Phase Prompt for Cashew-Inspired Offline Expense Tracker PWA

## Problem & Approach
Create a complete, ready-to-use **multi-phase AI development prompt** (without implementing the app yet) for building a lightweight, offline-first, no-installation-required cross-platform (Android, Windows, macOS) expense & budget tracker PWA modeled after **Cashew – Expense Budget Tracker**.

The target project folder for the app (and where both the plan and prompt document are saved) is:
- **`C:\Sudhansu\AI projects\expence-tracker`**

The deliverables saved to the project folder are:
1. **`C:\Sudhansu\AI projects\expence-tracker\plan.md`** — Copy of this finalized implementation plan.
2. **`C:\Sudhansu\AI projects\expence-tracker\expense-tracker-prompt.md`** — Complete, copy-pasteable multi-phase prompt document targeting `C:\Sudhansu\AI projects\expence-tracker`.

## Target App Specification (Captured in the Prompt)
- **100% Free & Privacy-First**: Completely free to use forever — all features unlocked out of the box with no paywalls, no "Pro" tiers, no ads, no telemetry/tracking, and no paid third-party APIs or external cloud servers required.
- **Authentication & Data Security (Offline Login + End-to-End Encryption)**:
  - **Local Offline Login Gate (Zero Unauthorized Access)**: First-run vault creation (Username + Password, plus optional quick PIN and recovery key). Nothing in the app is accessible until authenticated. Credentials are never stored in plaintext — verified via Web Crypto `PBKDF2-SHA256` (salted, high iterations) with brute-force attempt throttling/lockout.
  - **Encrypted Local Storage (`AES-256-GCM`)**: Financial records stored in `IndexedDB` are encrypted at rest with a key derived from the user's login credentials (held only in memory during the active session and cleared on Logout / Auto-Lock / tab close).
  - **Session Controls & Privacy Mode**: Explicit Logout/Lock button, configurable inactivity auto-lock timer, optional WebAuthn biometric quick-unlock (Windows Hello / Touch ID / Android fingerprint where supported), and a one-tap "Hide Amounts" privacy toggle.
  - **AES-256-GCM Encrypted Backups & Cross-Device Sync**: Exported `.enc.json` backups and optional cloud-synced files (Google Drive / Private GitHub Gist) are end-to-end encrypted on-device before leaving the device.
  - **XSS & Injection Hardening**: Strict Content Security Policy (CSP), zero `eval()`, and safe DOM rendering (`textContent` / sanitized nodes) for all user-entered notes, categories, and wallet names.
- **Platform & Delivery**: Lightweight static web app / PWA (vanilla HTML/CSS/JS, offline-first via Service Worker + Web App Manifest, optional "Add to Home Screen" on Android/Windows/macOS, no app store or server required).
- **UI & Design Language**: Cashew-inspired Material You / Material 3 aesthetic — rounded cards, pill buttons, floating action button (FAB) for fast expense entry, bottom navigation bar on mobile + responsive sidebar on desktop (Windows/macOS), crisp inline SVG / Lucide-style icons, smooth micro-interactions, Light/Dark mode + dynamic accent color picker.
- **Graphical Dashboards**: Interactive **Daily**, **Weekly**, and **Monthly** dashboards with:
  - Spending trend line/area charts & daily bar charts
  - Category breakdown donut/pie charts with percentage & icon legends
  - Income vs. Expense comparison & net balance cards
  - Period switcher (Today / This Week / This Month / Custom range)
- **Core Cashew-Inspired & Advanced Personal Finance Features**:
  - **Fast Transaction Entry & Splitting**: Expense / Income / Transfer entry with calculator keypad, date/time, notes, category, wallet, **Transaction Splitting** (split one UPI/supermarket bill across multiple categories with sum validation), and **Custom Tags** (`#vacation`, `#reimbursable`, etc.) with tag filtering.
  - **Custom Categories & Auto-Categorization Rules**: Custom categories & subcategories with inline SVG icon picker and color coding, plus an **Auto-Categorization Rule Engine** that learns merchant/UPI patterns (Swiggy → Food, Uber → Transport) and lets users create custom rules for local UPI vendors.
  - **Automatic Capture, Parsing & Self-Transfer Detection**:
    - **On-Device SMS & UPI Notification Parser + Credit Card Bill Detector**: Built-in local parser for Indian bank debit/credit alerts, credit card swipes, **credit card statement/bill due SMS** (extracting card last-4 digits, Total Due, Minimum Due, and Due Date for HDFC/ICICI/SBI/Axis/Kotak/Amex/IDFC/OneCard, etc.), and GPay/PhonePe/Paytm notifications (paste/Android Share-Sheet/statement import in the no-install PWA, plus an optional Android Capacitor `NotificationListenerService` + SMS broadcast receiver in Phase 5 for hands-free real-time background capture on Android — 100% on-device, zero raw messages sent to servers).
    - **Account Aggregator (AA) Ready Adapter**: Pluggable RBI ReBIT Account Aggregator JSON/statement importer & adapter interface for fetching/importing official bank statements and balances securely.
    - **Self-Transfer Detection**: Automatically identifies and excludes money moved between your own bank accounts or loaded into wallets so daily/monthly spending is never artificially inflated.
  - **Daily Budgeting & Controls**:
    - **Safe-to-Spend Daily Allowance**: Dynamically calculates today's safe spending limit from monthly income, fixed bills/EMIs, savings goals, and remaining days in the month.
    - **Category Caps with Real-Time Alerts**: Instant in-app & local Web Notification alerts at **75%** and **100%** of any category limit.
    - **Bill, EMI, Credit Card & Subscription Reminders**: Detects recurring auto-debits (OTT, utilities, loan EMIs) and **credit card bills parsed from Android SMS** (linking to the card wallet, showing Total Due / Min Due / Due Date, firing multi-stage pre-due reminders at 5 days, 2 days, and due day, and auto-marking paid when a matching card payment is recorded/parsed) to prevent overdrafts or late fees.
  - **Insights, Multi-Wallets & Net Worth**:
    - **Multiple Wallets/Accounts**: Cash, Bank, Credit Card (with dues tracking), and UPI accounts with transfers & multi-currency support (default **INR ₹** with currency switcher).
    - **Cash Flow & Net Worth Snapshot**: Single unified view combining bank/cash balances, credit card dues, net worth, and daily/monthly cash outflow.
    - **Savings Goals & Targets**: Progress rings and contribution history.
  - **Local Encrypted Persistence, Biometric Lock & Google Drive Backup**: Encrypted `IndexedDB` behind Login/PIN/WebAuthn Biometric lock + AES-256-GCM encrypted Google Drive backup/sync & Smart-Merge JSON/CSV export across Android, Windows, and macOS.

## Multi-Phase Prompt Structure
1. **Shared Context & System Rules Header**: Project folder (`C:\Sudhansu\AI projects\expence-tracker`), 100% free & privacy-first rules, offline-first PWA rules, Web Crypto security rules, encrypted `IndexedDB` schema, and Cashew Material You design tokens.
2. **Phase 0 Prompt — Interactive Figma-Like UI Prototype (`prototype/index.html`)**: Clickable visual-first design mockup with Mobile/Desktop frame switcher, Light/Dark + accent switcher, Login/Biometric screen, Safe-to-Spend, Net Worth Snapshot, Daily/Weekly/Monthly Dashboards, Split & `#tags`, Credit Card Bill Reminders, SMS Parser preview, and realistic sample INR data.
3. **Phase 1 Prompt — Offline Login Gate, Encrypted Storage, App Shell, Wallets, Categories, Rules & Core Transactions**: Offline Auth (`PBKDF2-SHA256` + `AES-256-GCM` encrypted `IndexedDB`), WebAuthn biometric/PIN unlock, Material You shell, multi-wallets (Cash/Bank/Credit Card dues/UPI), categories/icons, Auto-Categorization Rules, Transaction Splitting, `#tags`, and Self-Transfer Detection.
4. **Phase 2 Prompt — Daily, Weekly & Monthly Graphical Dashboards + Cash Flow & Net Worth Snapshot**: Offline Canvas/SVG charts, Safe-to-Spend Daily Allowance, Cash Flow & Net Worth Snapshot, category donuts, income vs. expense comparisons, and tag filters.
5. **Phase 3 Prompt — Smart Budgeting (75%/100% Alerts), Bills/EMIs/Credit Card Bill SMS Reminders & On-Device SMS/AA Parser**: Category caps with 75%/100% real-time alerts, Savings Goals, Recurring Bills/EMIs/Subscriptions, On-Device SMS & UPI Parser (including Credit Card Bill SMS extraction + 5d/2d/due-day reminders + auto-mark-paid), and RBI Account Aggregator (ReBIT JSON/CSV) importer & adapter.
6. **Phase 4 Prompt — Offline PWA, AES-256-GCM Encrypted Google Drive Sync, Backup/Export & Polish**: Service Worker + Manifest, E2E-encrypted Google Drive AppData sync + Smart-Merge `.enc.json` backup/restore across Windows/Android/MacBook, CSV export, Hide-Amounts privacy mode, and Android/Windows/macOS polish.
7. **Phase 5 Prompt (Optional) — Android Native Companion Bridge**: Lightweight Capacitor Android wrapper (`RECEIVE_SMS`/`READ_SMS` + `NotificationListenerService` + Android local scheduled notifications) for hands-free background credit card bill SMS reminders and real-time UPI/bank debit capture on Android (100% on-device).

---

## Implementation Status & Changelog (Completed So Far)

**Status**: All planned phases (**Phase 0 – Phase 5**) plus post-launch UI, Investment, Reminder, PDF Statement Import, Credit Card, and Cross-Platform enhancements are **implemented** inside `C:\Sudhansu\AI projects\expence-tracker` (Service Worker cache: `cashewflow-v1.0.20`).

### 1. Core App & Initial Release (`5b5abde`, `48d2bca`)
- **Phase 0 Interactive Prototype** (`prototype/index.html`): Self-contained clickable UI mockup with Mobile/Desktop frame switcher, Light/Dark + accent toggle, and sample INR data.
- **Phase 1 Security & Core Vault** (`js/crypto.js`, `js/auth.js`, `js/db.js`, `js/rules.js`, `js/app.js`): Offline Login gate (Username + Password + Quick PIN + 24-char Recovery Key + WebAuthn biometric presence), `PBKDF2-SHA256` (210,000 iterations), `AES-256-GCM` encrypted `IndexedDB` at rest, progressive failed-attempt lockout, inactivity auto-lock, CSP-safe calculator keypad, multi-wallets, custom categories, Transaction Splitting, `#tags`, Auto-Categorization Rules, and Self-Transfer Detection.
- **Clean ₹0 First-Run State** (`48d2bca`): Removed hardcoded sample wallet balances/income estimates on new vault creation and added a one-tap **Reset Balances to ₹0** button in Settings.
- **Phase 2 Dashboards** (`js/charts.js`, `js/views/dashboard.js`): Zero-CDN high-DPI Canvas/SVG charts, Daily/Weekly/Monthly/Custom segmented views, Safe-to-Spend Daily Allowance, and Cash Flow snapshot.
- **Phase 3 Smart Budgets, Alerts & Parsers** (`js/reminders.js`, `js/parser.js`, `js/views/budgets.js`, `js/views/capture.js`): Category caps with real-time 75%/100% alerts, Savings Goals, Recurring Bills/EMIs/Subscriptions detector, On-Device Indian Bank SMS / UPI / Credit Card Bill SMS parser, and RBI Account Aggregator (ReBIT JSON/CSV) importer.
- **Phase 4 Offline PWA & Sync** (`manifest.json`, `sw.js`, `js/sync.js`, `js/views/settings.js`): Network-First Service Worker with full offline precache fallback, `AES-256-GCM` `.enc.json` backup with Smart-Merge (`id` + `updatedAt` + `deletedAt`), UTF-8 BOM CSV export, optional free E2E-encrypted Google Drive `appDataFolder` sync, and desktop keyboard shortcuts.
- **Phase 5 Android Native Companion & CI Build** (`android-bridge/`, `.github/workflows/build-android-apk.yml` — `f86e7ac`, `61a5d2b`): Capacitor Android wrapper (`CashewSmsReceiver.kt`, `CashewNotificationListener.kt`, `CashewBridgePlugin.kt`) with 30-day SMS inbox scanner, PWA clipboard/Share-Sheet auto-capture hooks, and automated GitHub Actions **signed Release APK** workflow (`CashewFlow-release.apk`).

### 2. Apple Liquid Glass UI & Duotone Icons (`a642fc2`, `5df123c`, `fe0800b`, `d88f82f`, `92503b1`)
- **iOS 26/27 Liquid Glass Redesign** (`css/tokens.css`, `css/layout.css`, `css/components.css`): Ambient multi-orb mesh background, frosted translucent glass cards, floating pill mobile bottom dock & desktop glass rail, specular glass sheen (`::before`) & springy press feedback on all buttons, and `prefers-reduced-transparency` fallback.
- **Adjustable Liquid Glass Level (`0%–100%`)** (`5df123c`): Added live slider + presets (**Solid**, **Subtle**, **Balanced**, **iOS Liquid**, **Ultra Clear**) in Settings, persisted in encrypted vault settings.
- **Duotone SF-Symbol Icon Library** (`js/icons.js` — `fe0800b`): Upgraded to 41 inline duotone SVG icons including dedicated grocery icons (`cart`, `milk`, `veggies`, `fruit`, `store`, `coffee`) and investment icons (`trendingUp`, `candles`, `coins`, `piggy`).
- **PWA Icons & Android Installability** (`d88f82f`, `92503b1`): Generated crisp Liquid Glass Wallet + `₹` PNG icons (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`) and updated `manifest.json` (`id`, `start_url`, PNG `any`/`maskable`) + cache-busted manifest link so Android Chrome offers native **Install**.

### 3. Groceries Quick-Add, Investments & Scheduled Reminders (`baa7837`, `3323675`, `d999707`)
- **1-Tap Grocery Quick-Add & Smart Past-Purchase Suggestions** (`baa7837`): Scans past days/weeks/months to rank frequent & recent purchases on the Dashboard Quick Add bar and live inside the Add Transaction sheet (1-tap pre-fill of merchant, last price, category, wallet, and `#tags`), plus starter grocery items.
- **Investment Tracking (FD, SIP, Equity, PPF/EPF/NPS, Gold/SGB, RD)** (`3323675`): Added `Invest` transaction type, `+ Invest` quick button, 6 default investment categories, Quick Investment chips, **Income vs. Expense vs. Investment** 3-bar chart, **Investments** donut chart with **% of Total Income** progress bar, and **Investments** filter in Transactions.
- **Scheduled Daily / Weekly / Yearly Expense Update Reminders** (`d999707`): Configurable reminder time, frequency (Daily / Weekly + Day / Yearly + Month & Day), custom message (*"Please update today's expenses!"*), optional *skip if already logged today*, native Service Worker notification + Dashboard banner, and **RFC-5545 `.ics` Calendar Export** for guaranteed OS-level alarms even when the browser is closed.

### 4. Offline Google Pay & Bank Statement PDF Importer (`aa88dfb`, `6c0811e`, `3f3c4ab`, `bc54861`)
- **Pure-JS Offline Statement Importer** (`js/statement.js`): Supports Google Pay PDF statements, Google Takeout HTML/JSON, and Bank/UPI CSV/TSV/TXT with zero external CDNs using native `DecompressionStream`, `FlateDecode`, `ObjStm`, per-font `ToUnicode` CMaps (`bfchar`/`bfrange`), PDF CTM (`q`/`Q`/`cm`) matrix stack, and `(x, y)` row reconstruction.
- **Statement Accuracy Fixes** (`3f3c4ab`, `bc54861`): Excluded statement-period summary header totals and prevented 4-digit bank account suffixes (e.g., `Self transfer to HDFC Bank 3588`) from being misread as transaction amounts (`₹3,588`) by prioritizing explicit `₹/Rs./INR` amounts.

### 5. Period-Scoped Cash Flow, Credit Card Dues Paid & Cross-Platform Launchers (`af660c7`, `a5127db`, `b2be9d1`, `fcefc5b`, `91386cd`)
- **1-Click Local Launchers & iOS/Android Mobile Polish** (`af660c7`): Added `Start-CashewFlow.bat` (Windows 1-click launcher), `start-cashewflow.command` (macOS 1-click launcher), updated `HOW-TO-RUN.md` with Windows/macOS/Android/iOS guides, added iOS Safari standalone PWA meta tags (`black-translucent` status bar, adaptive light/dark `theme-color`), and disabled iOS input auto-zoom (`16px` on touch inputs).
- **Period-Scoped Cash Flow** (`b2be9d1`): Scoped the Dashboard **Cash Flow** headline and tiles strictly to the selected period (Daily / Weekly / Selected Month / Custom Date Range) instead of all-time cumulative balances.
- **Credit Card Dues & `CC Dues Paid` Tracking** (`a5127db`, `fcefc5b`, `91386cd`):
  - Auto-linked credit card bill payments to Credit Card wallets and converted positive Credit Card opening balances to unpaid dues.
  - Added a dedicated period-aware **`CC Dues Paid`** tile on the Dashboard (updates for Monthly & Custom date ranges), a **`Credit Card`** filter pill + `CC Paid` summary chip in Transactions, and a **`Count as Credit Card Dues Paid (#cc-bill)`** toggle in the Transaction modal.
  - Broadened Indian card issuer matching (`SBI Cards and Payment Services Limited`, HDFC/ICICI/Axis/Kotak/RBL/IndusInd/IDFC/BOB/AU/Amex/OneCard/CRED) while excluding normal merchant purchases paid *using/via* a RuPay Credit Card.
