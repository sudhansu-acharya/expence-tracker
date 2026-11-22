# Multi-Phase AI Prompt: Cashew-Inspired Offline Expense & Budget Tracker

> **Project Root Folder**: `C:\Sudhansu\AI projects\expence-tracker`
> **App Type**: 100% Free, Privacy-First, Offline-First Cross-Platform PWA (Android, Windows, macOS) + Optional Phase 5 Android SMS/Notification Bridge
> **Design Inspiration**: Cashew – Expense Budget Tracker (Material You / Material 3 UI, rounded cards, vibrant category icons, smooth micro-interactions)
> **Default Currency**: INR (`₹`) with multi-currency switcher

---

## How to Use These Prompts

Run each phase **in order** (Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → optional Phase 5).
- Always paste the **Shared Context & System Rules** block along with the phase you are running (or tell your AI assistant to read `expense-tracker-prompt.md` and execute a specific phase).
- **Start with Phase 0** to generate an interactive Figma-like prototype (`prototype/index.html`) that you can open directly in your browser, click through, and refine visually before building the full app in Phases 1–4.
- **Zero-Install Offline Usage**: Once built, the app opens directly in Chrome/Edge/Safari on Android, Windows, and macOS (and optionally supports "Add to Home Screen" as a PWA) — completely free, no Play Store/App Store install required.
- **Cross-Device Sync (Windows ↔ Android ↔ MacBook)**: Handled in Phase 4 via **Smart-Merge `.enc.json` files** (100% offline) and optional **AES-256-GCM end-to-end encrypted Google Drive AppData sync** (free, encrypted on-device before upload).
- **Credit Card Bill SMS Reminders & Real-Time Android SMS/UPI Capture**:
  - In the no-install PWA (Phases 1–4), an on-device parser handles pasted/shared SMS & UPI notifications and bank/AA statements without sending raw messages to any server.
  - For **fully automatic background reading of Android SMS (including Credit Card Bills) and GPay/PhonePe/Paytm notifications**, run **Phase 5 (Optional)** to wrap the exact same offline app in a lightweight Capacitor Android companion bridge (`NotificationListenerService` + `RECEIVE_SMS`/`READ_SMS` + native scheduled notifications) — still 100% on-device and free.

---

## SHARED CONTEXT & SYSTEM RULES (Include with Every Phase)

```markdown
You are building a lightweight, 100% FREE, offline-first, privacy-first personal expense & budget tracker inspired by **Cashew – Expense Budget Tracker**.

### 1. Project Location & Tech Stack
- **Target Folder**: `C:\Sudhansu\AI projects\expence-tracker`
- **Tech Stack**: Pure, lightweight, dependency-free **HTML5, modern CSS3 (CSS Variables, Grid, Flexbox), and modular ES2022 JavaScript** (no heavy frameworks, no Node build step required to run, no runtime CDN links).
- **100% Offline Guarantee**: Every icon (inline SVG sprite/registry), font fallback stack (system UI fonts), chart renderer (custom Canvas/SVG), and crypto routine (native Web Crypto API) MUST be self-contained inside `C:\Sudhansu\AI projects\expence-tracker`. Zero external CDN calls at runtime.
- **100% Free & Privacy-First**: All features are permanently free and unlocked. No paywalls, no "Pro" tiers, no ads, no third-party analytics/telemetry, and no remote servers storing plaintext financial data.

### 2. Security & Authentication Architecture
- **Mandatory Local Offline Login Gate**: No financial data or dashboard is accessible until the user authenticates with their local vault credentials (Username + Password, plus optional quick 4–6 digit PIN and optional WebAuthn biometric quick-unlock via Android Fingerprint / Windows Hello / macOS Touch ID).
- **Zero Plaintext Secrets**: Derive verification hashes and encryption keys using native `crypto.subtle` (`PBKDF2` with `SHA-256`, >= 210,000 iterations, unique 16-byte random salt).
- **Encrypted Storage at Rest (`AES-256-GCM`)**: All sensitive records in `IndexedDB` are encrypted with a unique 12-byte random IV per record/vault payload using the session key kept only in JS memory. On Logout, Auto-Lock, or page unload, wipe the in-memory key immediately.
- **Brute-Force Protection**: Track failed login attempts with progressive cooldown/lockout (e.g., 5 failed attempts → 30s lockout, escalating). Provide a one-time printable/copyable Recovery Key during vault setup.
- **Strict XSS & CSP Hygiene**: Include a strict Content Security Policy `<meta http-equiv="Content-Security-Policy">` (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`). Never use `eval()`, `new Function()`, or unsanitized `innerHTML` with user-entered strings (always use `textContent` or safe DOM element builders).

### 3. Cross-Platform Responsive Design (Cashew Material You Aesthetic)
- **Devices**: Android mobile (touch-first, bottom navigation bar + floating `+` FAB, 44px+ tap targets, bottom sheets), Windows & macOS desktop (responsive collapsible left navigation rail, multi-column dashboard grid, keyboard shortcuts).
- **Visual Style**: Material You / Material 3 — soft rounded cards (`16px–24px` radius), pill chips, crisp inline SVG icons inside tinted circular category badges, subtle elevation, smooth 200ms transitions, **Light & Dark modes**, and a **Dynamic Accent Color Picker** (Emerald/Cashew Green default, Indigo, Coral, Amber, Violet, Teal).
- **Currency**: Default **INR (`₹`)** formatted in Indian numbering style (`₹1,24,500.00`) with a full multi-currency switcher (INR, USD, EUR, GBP, AED, SGD, etc.).

### 4. Canonical IndexedDB Data Schema (`cashew_vault_db`)
All syncable records include `id` (UUID v4), `createdAt` (ISO-8601), `updatedAt` (ISO-8601), and `deletedAt` (ISO-8601 | `null`, tombstone for Smart-Merge sync).
- `auth_meta` (unencrypted metadata only): `{ username, saltB64, verifierHashB64, wrappedVaultKeyB64, ivB64, pinWrappedKeyB64?, recoveryWrappedKeyB64?, webAuthnCredId?, autoLockMinutes, failedAttempts, lockoutUntil }`
- `wallets` (encrypted): `{ id, name, type: 'cash'|'bank'|'credit_card'|'upi', currency, initialBalance, currentBalance, creditLimit?, billingDay?, dueDay?, last4Digits?, institution?, color, icon, isArchived, createdAt, updatedAt, deletedAt }`
- `categories` (encrypted): `{ id, name, type: 'expense'|'income', parentId: null|string, icon, color, isSystem, createdAt, updatedAt, deletedAt }`
- `transactions` (encrypted): `{ id, type: 'expense'|'income'|'transfer', amount, currency, date, walletId, toWalletId?, categoryId?, splits: [{ categoryId, amount, note? }] | null, tags: string[], merchant?, note?, source: 'manual'|'sms'|'upi_notif'|'aa_import'|'recurring', sourceHash?, isSelfTransfer: boolean, recurringId?, createdAt, updatedAt, deletedAt }`
- `budgets` (encrypted): `{ id, name, period: 'daily'|'weekly'|'monthly', amount, categoryIds: string[], alert75SentPeriod?, alert100SentPeriod?, createdAt, updatedAt, deletedAt }`
- `goals` (encrypted): `{ id, name, targetAmount, currentAmount, deadline?, icon, color, contributions: [{ id, amount, date, walletId? }], createdAt, updatedAt, deletedAt }`
- `recurring` (encrypted): `{ id, title, kind: 'bill'|'emi'|'subscription'|'income', amount, type: 'expense'|'income', walletId, categoryId, frequency: 'daily'|'weekly'|'monthly'|'yearly', nextDueDate, remindDaysBefore: number[], autoPost: boolean, isActive: boolean, createdAt, updatedAt, deletedAt }`
- `credit_card_bills` (encrypted): `{ id, walletId, cardName, last4Digits, statementMonth, totalDue, minDue, dueDate, status: 'unpaid'|'partial'|'paid', paidAmount, paidTransactionId?, rawSourceSnippet?, remindersSent: string[], createdAt, updatedAt, deletedAt }`
- `categorization_rules` (encrypted): `{ id, pattern, matchType: 'contains'|'regex'|'vpa', categoryId, tags?: string[], priority, hitCount, isUserDefined: boolean, createdAt, updatedAt, deletedAt }`
- `settings` (encrypted): `{ defaultCurrency, numberFormat: 'en-IN'|'en-US', themeMode: 'system'|'light'|'dark', accentColor, hideAmounts: boolean, monthlyIncomeEstimate?, syncProvider: 'none'|'gdrive', lastSyncAt?, ... }`

### 5. Planned Folder Structure inside `C:\Sudhansu\AI projects\expence-tracker`
```
C:\Sudhansu\AI projects\expence-tracker\
├── prototype\
│   └── index.html              # Phase 0 interactive Figma-like design prototype
├── index.html                  # Main PWA entry point
├── manifest.json               # PWA Web App Manifest
├── sw.js                       # Offline-first Service Worker
├── assets\
│   └── icons\                  # Local PWA app icons (192x192, 512x512, maskable SVG/PNG)
├── css\
│   ├── tokens.css              # Material You color/spacing/radius tokens & themes
│   ├── layout.css              # Responsive mobile bottom-nav & desktop rail shell
│   └── components.css          # Cards, sheets, charts, badges, calculator keypad
└── js\
    ├── app.js                  # Bootstrapping, router, state coordination
    ├── crypto.js               # PBKDF2, AES-256-GCM, WebAuthn helper
    ├── auth.js                 # Login gate, vault setup, PIN, lockout, auto-lock
    ├── db.js                   # Encrypted IndexedDB wrapper + CRUD repositories
    ├── icons.js                # Self-contained inline SVG icon library
    ├── format.js               # INR/multi-currency formatting & hide-amounts helper
    ├── rules.js                # Auto-categorization & self-transfer detection engine
    ├── charts.js               # Zero-CDN Canvas/SVG chart renderers
    ├── parser.js               # On-device Indian Bank SMS, UPI & CC Bill parser + AA importer
    ├── reminders.js            # 75%/100% category cap alerts, EMI & CC bill reminders
    ├── sync.js                 # Smart-Merge engine, .enc.json backup, CSV export, Google Drive sync
    └── views\                  # Modular UI views (dashboard, transactions, budgets, wallets, insights, settings)
```
```

---

## PHASE 0 PROMPT — Interactive Figma-Like UI Prototype (Review Before Full Implementation)

> **Goal**: Create a single, self-contained, clickable, visual-first design prototype so you can inspect every screen, layout, icon, chart, and interaction on both Mobile (Android) and Desktop (Windows/macOS) before writing production storage or sync code.

```markdown
Using the Shared Context above, execute **Phase 0 ONLY**: build an interactive, Figma-like clickable design prototype at:
`C:\Sudhansu\AI projects\expence-tracker\prototype\index.html`

Do NOT build the production app files yet. Keep this prototype self-contained in `prototype\index.html` (inline CSS + inline JS + inline SVGs, zero external CDN links) so I can double-click it on Windows/macOS or open it on Android immediately.

### Required Prototype Controls (Top Figma-Style Preview Bar)
1. **Viewport Frame Switcher**: Toggle between **Android Mobile (390×844 phone frame)** and **Desktop (Windows/macOS full responsive layout)**.
2. **Theme & Accent Switcher**: Toggle **Light / Dark** mode and switch Material You accent colors (Cashew Emerald, Ocean Indigo, Sunset Coral, Royal Violet, Warm Amber).
3. **Privacy Eye Toggle**: One-click "Hide Amounts" (`₹ •••••`) across the entire prototype.
4. **Screen Jump Pills**: Quick-jump to any screen directly for review.

### Required Interactive Screens (Populated with Realistic Indian Sample Data in INR `₹`)
1. **Login / Unlock Screen**:
   - Clean Cashew-style card with Username + Password fields, quick 4-digit PIN pad toggle, and "Unlock with Fingerprint / Biometric" button (simulated unlock into the app).
2. **Home / Dashboard Screen (Daily, Weekly, Monthly Segmented Tabs)**:
   - **Safe-to-Spend Daily Allowance Hero Card**: e.g., "Safe to spend today: `₹1,140`" with breakdown pill (`Income ₹85,000 − Bills/EMIs ₹32,000 − Savings ₹15,000 ÷ remaining days`).
   - **Cash Flow & Net Worth Snapshot Card**: Combined Bank/Cash/UPI balance (`₹2,48,500`), Credit Card Dues (`-₹24,850`), Net Worth (`₹2,23,650`), and today's outflow.
   - **Upcoming Credit Card Bill Alert Banner**: e.g., "HDFC Regalia ••4821 — Total Due `₹18,450` (Min `₹925`) due in 3 days • Detected from SMS" with quick "Mark Paid" button.
   - **Interactive Period Tabs (`Daily` | `Weekly` | `Monthly`)**:
     - Switch charts dynamically: Spending Trend Area/Line Chart, Daily Bar Chart, Category Breakdown Donut Chart with icon legends, and Income vs. Expense comparison bars.
   - **Recent Transactions List**: Showing category icon badges, merchant (Swiggy, Uber, DMart, JioFiber), `#tags` pills (`#vacation`, `#reimbursable`), Split badge (`Split ×2`), and Self-Transfer badge (`Excluded from spend`).
3. **Add Transaction Bottom Sheet / Modal (Triggered by `+` FAB)**:
   - Expense / Income / Transfer tabs, built-in **calculator keypad**, Wallet selector (HDFC Bank, Cash, GPay UPI, HDFC Credit Card), Category grid with vibrant SVG icons, **Split Transaction UI** (split across 2+ categories with live remaining balance indicator), **Custom `#tags` input**, and an **"Auto-categorized by rule: Swiggy → Food"** chip preview.
4. **Budgets, Goals & Reminders Screen**:
   - Category Cap cards with animated progress bars showing **Normal (<75%)**, **Warning (75%+ amber badge)**, and **Exceeded (100%+ red alert badge)**.
   - Savings Goals cards with circular progress rings (e.g., "Emergency Fund", "MacBook Upgrade").
   - Upcoming Bills, EMIs & Credit Card Due Dates timeline (Netflix OTT, Home Loan EMI, HDFC Credit Card Bill).
5. **Smart Capture & Rules Screen**:
   - **On-Device SMS / UPI Notification Parser Playground**: Preloaded sample Indian bank debit SMS, GPay UPI alert, and HDFC/ICICI Credit Card Bill SMS — clicking "Parse" shows the extracted fields (Amount, Merchant, Card Last-4, Total Due, Min Due, Due Date, Auto-Category, Self-Transfer check).
   - **Auto-Categorization Rules List** (Swiggy → Food, Uber → Transport, Local Kirana UPI → Groceries) with "Add Rule" UI.
   - **Wallets & Account Aggregator (AA) Import Preview**: Cards for Cash, Bank, UPI, and Credit Card (with credit limit utilization bar) + "Import AA / Bank Statement" preview.
6. **Settings & Sync Screen**:
   - Currency switcher (`INR ₹` default), Security & Auto-Lock settings, Biometric toggle, Encrypted Google Drive Sync status card, and `.enc.json` Backup / CSV Export buttons.

### Verification
- Open `prototype\index.html` with zero console errors and zero external network requests.
- Confirm every tab, theme switch, viewport toggle, FAB modal, split calculator, and SMS parser demo works smoothly.
```

---

## PHASE 1 PROMPT — Offline Login Gate, Encrypted Vault, Core App Shell, Wallets, Categories, Rules & Transactions

> **Goal**: Build the production foundation inside `C:\Sudhansu\AI projects\expence-tracker` with real offline authentication, `AES-256-GCM` encrypted `IndexedDB`, Cashew Material You shell, multi-wallets, custom categories/icons, auto-categorization rules, transaction splitting, custom `#tags`, and self-transfer detection.

```markdown
Using the Shared Context above (and matching the approved visual design from `prototype\index.html`), execute **Phase 1 ONLY** inside `C:\Sudhansu\AI projects\expence-tracker`.

### 1. Security, Offline Login & Encrypted Storage (`js\crypto.js`, `js\auth.js`, `js\db.js`)
- **First-Run Vault Setup**:
  - Create local account (Username + strong Password with strength meter).
  - Generate a random 256-bit **Vault Master Key (VMK)**. Wrap (encrypt) the VMK with a key derived from the Password via `PBKDF2-SHA256` (210,000+ iterations, unique 16-byte salt).
  - Generate and display a one-time **Recovery Key** (e.g., 6 groups of 4 alphanumeric chars) that also wraps the VMK, with a "Copy / Download Recovery Key" confirmation step.
  - Optional: let the user enable a **Quick 4–6 Digit PIN** and **WebAuthn Biometric Unlock** (using `navigator.credentials.create/get` where supported, gracefully falling back to Password/PIN on unsupported browsers).
- **Login & Session Lock**:
  - Block all app routes and never decrypt `IndexedDB` until authenticated.
  - Progressive lockout after 5 failed attempts (30s, then 2m, then 5m).
  - Header/Sidebar **Lock / Logout** button + configurable **Inactivity Auto-Lock** (1, 5, 15, 30 min, or on tab hidden).
  - Password change & Recovery Key reset flow that re-wraps the VMK without losing data.
- **Encrypted `IndexedDB` Layer (`js\db.js`)**:
  - Implement stores defined in Shared Context (`auth_meta`, `wallets`, `categories`, `transactions`, `budgets`, `goals`, `recurring`, `credit_card_bills`, `categorization_rules`, `settings`).
  - Encrypt every record payload (except `id`, `updatedAt`, `deletedAt` indexes needed for lookup/sync) with `AES-256-GCM` + unique 12-byte IV before writing, and decrypt on read.
  - Seed sensible default Indian categories (Food & Dining, Groceries, Commute & Fuel, Bills & Utilities, Shopping, Entertainment & OTT, Health, EMI & Loans, Rent, Travel, Salary, Freelance, Cashback, Investments) with inline SVG icons (`js\icons.js`) and starter wallets (Cash, Primary Bank, UPI, Credit Card).

### 2. Responsive Material You App Shell & Theming (`index.html`, `css\tokens.css`, `css\layout.css`, `css\components.css`)
- Mobile bottom navigation bar (Dashboard, Transactions, Budgets, Capture/Tools, Settings) + centered/floating `+` FAB; Desktop collapsible left navigation rail.
- Light / Dark / System theme engine + Dynamic Accent Color Picker persisted in encrypted `settings`.
- Default **INR (`₹`)** Indian numbering formatter (`js\format.js`) + currency switcher + global **Hide Amounts** privacy toggle.

### 3. Wallets, Categories, Rules, Splitting, Tags & Self-Transfer Detection (`js\rules.js`, `js\views\transactions.js`, `js\views\wallets.js`)
- **Multi-Wallet Management**: CRUD for Cash, Bank, UPI, and Credit Card accounts (with `creditLimit`, `billingDay`, `dueDay`, `last4Digits`, live balance & credit utilization calculation).
- **Custom Categories & Subcategories**: Create/edit/delete categories & subcategories with inline SVG icon picker and color palette.
- **Fast Transaction Entry & CRUD**:
  - Expense / Income / Transfer sheet with built-in calculator keypad (`+`, `-`, `*`, `/`, `=`).
  - **Transaction Splitting**: Toggle "Split across categories" to divide one transaction into 2+ category rows (`splits[]`), enforcing `sum(splits) === amount` with live remaining indicator.
  - **Custom `#tags` & Notes**: Multi-tag chip input with autocomplete of existing tags (e.g., `#vacation`, `#reimbursable`, `#office`), plus filterable transaction list by search text, wallet, category, type, date range, and `#tag`.
- **Auto-Categorization Rule Engine (`js\rules.js`)**:
  - Built-in default Indian merchant patterns (Swiggy/Zomato → Food, Blinkit/Zepto/BigBasket/DMart → Groceries, Uber/Ola/Rapido/Metro → Commute, Netflix/Spotify/Prime/Hotstar → Entertainment, Airtel/Jio/BESCOM → Bills).
  - Custom rule manager (contains / regex / UPI VPA pattern → target category + optional auto-tags) + automatic learning when a user repeatedly assigns a merchant to a category.
- **Self-Transfer Detection (`js\rules.js`)**:
  - Automatically detect self-transfers (e.g., transfer between two own wallets, UPI wallet load, credit card bill payment from own bank, or matching debit/credit amounts within 10 minutes across own accounts) and flag `isSelfTransfer: true` so they are excluded from spending totals and budgets.

### Acceptance Criteria for Phase 1
- Vault creation, Login, Logout, Wrong-Password lockout, and Auto-Lock all work offline.
- Inspecting `IndexedDB` in browser DevTools confirms transaction/wallet payloads are encrypted ciphertext (no readable amounts or notes).
- Creating a split transaction, tagging it, adding an auto-categorization rule, and recording a self-transfer all persist across page reloads.
```

---

## PHASE 2 PROMPT — Daily, Weekly & Monthly Graphical Dashboards + Safe-to-Spend & Net Worth Snapshot

> **Goal**: Build rich, interactive, zero-CDN offline graphical dashboards for Daily, Weekly, and Monthly views, including the Safe-to-Spend Daily Allowance and unified Cash Flow & Net Worth Snapshot.

```markdown
Using the Shared Context and the Phase 1 codebase in `C:\Sudhansu\AI projects\expence-tracker`, execute **Phase 2 ONLY**: build the interactive graphical dashboards and analytics engine.

### 1. Zero-CDN Offline Chart Engine (`js\charts.js`)
- Build lightweight, crisp, high-DPI (`devicePixelRatio`-aware) **HTML5 Canvas / SVG** chart components with smooth animations, hover/tap tooltips, and full Light/Dark + Accent theme support:
  1. **Spending Trend Line / Area Chart** (with smooth curve, gradient fill, average reference line, and tap-to-inspect tooltip).
  2. **Daily / Weekly Bar Chart** (grouped or stacked bars for daily spending and Income vs. Expense comparisons).
  3. **Category Breakdown Donut Chart** (interactive slices, center total display, clickable icon + percentage legend).
  4. **Horizontal Comparison & Progress Bars** (top merchants, top `#tags`, wallet balances).

### 2. Daily, Weekly & Monthly Segmented Dashboard (`js\views\dashboard.js`)
- **Period Switcher**: Segmented control for **Daily**, **Weekly**, **Monthly**, plus **Custom Date Range**, with `<` / `>` quick navigation (Today, Yesterday, This Week, Last Week, This Month, etc.).
- **Safe-to-Spend Daily Allowance Card** (prominently pinned at top of Daily/Monthly view):
  - Formula:
    `SafeToSpendToday = max(0, (MonthlyIncome - RemainingFixedBillsAndEMIs - MonthlySavingsTarget - MonthToDateVariableSpend) / RemainingDaysInMonth)`
  - Show a clean expandable formula breakdown, color-coded status (On Track / Tight / Over Pace), and allow overriding Monthly Income Estimate if salary hasn't been logged yet.
- **Cash Flow & Net Worth Snapshot Card**:
  - Combines **Total Liquid Assets** (Bank + Cash + UPI wallets) minus **Total Credit Card Dues / Liabilities** = **Net Worth**, alongside **Period Cash Inflow**, **Period Cash Outflow** (strictly excluding `isSelfTransfer` transactions), and **Net Cash Flow** (`Inflow − Outflow`).
- **Accurate Split & Tag Aggregation**:
  - Split transactions (`splits[]`) MUST attribute each split's amount to its respective category in donut charts, bars, and category totals (never double-count).
  - Clicking any category slice, bar, or `#tag` pill drills down directly to the filtered Transactions view.
- **Daily View Specifics**: Hourly/time-of-day spending summary, Today's Safe-to-Spend gauge, today's transactions grouped by wallet, and comparison vs. daily average.
- **Weekly View Specifics**: 7-day bar chart (Mon–Sun), week-over-week `%` delta badge, top spending day, and category donut.
- **Monthly View Specifics**: Cumulative spending curve vs. monthly budget pace line, Income vs. Expense bar comparison, full category breakdown donut, top merchants, and `#tag` spending breakdown.

### Acceptance Criteria for Phase 2
- Switching between Daily, Weekly, and Monthly updates all KPIs and charts instantaneously with zero external network calls.
- Self-transfers are excluded from expense charts; split transactions are accurately allocated per category.
- Charts resize cleanly on Android portrait/landscape and Windows/macOS desktop windows and respect Hide-Amounts mode.
```

---

## PHASE 3 PROMPT — Smart Budgeting (75%/100% Alerts), Bills/EMIs/Credit Card Bill SMS Reminders, On-Device SMS/UPI Parser & AA Importer

> **Goal**: Implement Cashew-style budgets with real-time 75%/100% alerts, savings goals, recurring bills/EMIs/subscriptions, the on-device Indian Bank SMS / UPI / Credit Card Bill SMS parser with multi-stage due reminders, and the RBI Account Aggregator (AA) ReBIT statement importer/adapter.

```markdown
Using the Shared Context and the Phase 1–2 codebase in `C:\Sudhansu\AI projects\expence-tracker`, execute **Phase 3 ONLY**.

### 1. Category Caps with Real-Time 75% & 100% Alerts (`js\views\budgets.js`, `js\reminders.js`)
- **Budget Cards**: Create daily, weekly, or monthly budgets scoped to one or multiple categories (e.g., Dining Out, Groceries, Commute) or overall spend.
- Show Cashew-style progress bar, spent vs. limit, daily remaining pace, and status pill.
- **Real-Time Threshold Alerts**:
  - Whenever a transaction is added/edited/parsed, recalculate affected budgets immediately.
  - Trigger an in-app toast/banner AND a local **Web Notification** (via Notification API / Service Worker, if granted) when a category hits **≥ 75%** (Warning) and **≥ 100%** (Limit Reached/Exceeded), deduplicated per budget period (`alert75SentPeriod`, `alert100SentPeriod`).

### 2. Savings Goals & Recurring Bills / EMIs / Subscriptions (`js\views\budgets.js`, `js\reminders.js`)
- **Savings Goals**: Create goals with target amount, optional deadline, icon, color, circular progress ring, and "Add Contribution" flow (optionally transferring from a wallet).
- **Bills, EMIs & Subscriptions Tracker**:
  - Manage recurring items (`bill`, `emi`, `subscription`, `income`) with frequency, next due date, custom reminder lead days (default 3 days & 1 day before), and optional auto-posting.
  - **Auto-Detection**: Scan transaction history for repeated same-merchant/similar-amount debits (~28–31 days apart, e.g., Netflix, Spotify, Jio, loan EMI) and suggest converting them into tracked recurring reminders with one tap.
  - **Upcoming Timeline & Pre-Due Alerts**: Highlight bills/EMIs due within the next 7 days on the Dashboard and fire local reminders to prevent overdrafts or late fees.

### 3. On-Device Indian Bank SMS, UPI & Credit Card Bill Parser (`js\parser.js`, `js\views\capture.js`)
All parsing runs **100% locally in JavaScript** — zero raw SMS or notification text ever leaves the device.
- **Supported On-Device Capture Inputs (PWA)**:
  - Quick-Paste SMS / Notification box (single or bulk multi-line paste).
  - **Web Share Target** (`manifest.json` `share_target` prepared for Phase 4) so Android users can tap "Share" on an SMS/notification directly into the app.
  - Pluggable event hook `window.CashewBridge.onIncomingMessage({ source, sender, body, timestamp })` so the optional Phase 5 Android native wrapper can push live SMS & UPI notifications directly into this exact parser.
- **Parser Pattern Library**:
  - **Bank Debit / Credit SMS**: Major Indian banks (HDFC, ICICI, SBI, Axis, Kotak, Yes Bank, IDFC First, PNB, BOB, IndusInd, etc.) — extracts type (`expense`/`income`), amount (`Rs.`, `INR`, `₹`), merchant/payee, account last-4 digits, and date/time.
  - **UPI App Notifications**: GPay, PhonePe, Paytm, BHIM, CRED — extracts paid/received amount, VPA/merchant name, and bank/UPI wallet.
  - **Credit Card Swipe Alerts**: Extracts card last-4 digits, merchant, amount, and maps to the matching Credit Card wallet.
  - **Credit Card Bill / Statement Due SMS Detector**:
    - Detects bill-generated / payment-due SMS (e.g., *"HDFC Bank Credit Card xx4821 statement generated. Total Amount Due Rs 18,450.00, Min Due Rs 925.00, Due Date 05-Dec-2026"* and equivalent ICICI, SBI Card, Axis, Kotak, Amex, IDFC, OneCard, RBL formats).
    - Extracts: `cardName`, `last4Digits`, `totalDue`, `minDue`, `dueDate`, `statementMonth`.
    - Creates/updates a `credit_card_bills` record, links to the matching Credit Card wallet (updating its dues in the Net Worth Snapshot), and schedules **multi-stage reminders**: **5 days before**, **2 days before**, **on Due Date**, and **Overdue** until marked Paid.
    - **Auto-Mark Paid**: When a matching credit card bill payment transaction/SMS (e.g., CRED/NEFT/UPI payment to that card) is logged or parsed, automatically prompt/mark the bill as `paid` and flag it as a self-transfer if paid from the user's own bank account.
- **Deduplication & Review Queue**:
  - Compute `sourceHash` (SHA-256 of normalized sender + amount + date + snippet) to prevent duplicate imports.
  - Auto-apply Phase 1 **Auto-Categorization Rules** and **Self-Transfer Detection**, and show a clean "Review & Confirm" queue (with one-tap "Approve All").

### 4. Account Aggregator (AA) Ready Adapter & Statement Importer (`js\parser.js`, `js\views\capture.js`)
- Implement a clean, pluggable `AccountAggregatorAdapter` interface (`connect()`, `fetchAccounts()`, `fetchTransactions(since)`) documented for RBI-regulated AA FIU providers (Sahamati / ReBIT FI schema).
- Implement full **offline ReBIT AA FI JSON & Indian Bank Statement CSV Importer** (auto-mapping date, narration, debit, credit, balance columns), running imported rows through deduplication (`sourceHash`), Auto-Categorization Rules, and Self-Transfer Detection.

### Acceptance Criteria for Phase 3
- Crossing 75% and 100% of a category budget immediately fires the respective alert once per period.
- Pasting sample HDFC/ICICI/SBI debit SMS, GPay notification, and Credit Card Bill SMS accurately parses amounts, merchants, card last-4, Total Due, Min Due, and Due Date, and surfaces a Credit Card Bill reminder banner on the Dashboard.
- Re-pasting the same SMS is cleanly deduplicated via `sourceHash`.
- Importing a sample ReBIT AA JSON or bank CSV imports transactions, auto-categorizes merchants, and flags self-transfers.
```

---

## PHASE 4 PROMPT — Offline PWA, AES-256-GCM Encrypted Google Drive Sync, Backup/Export & Cross-Platform Polish

> **Goal**: Complete the install-free offline PWA experience (`sw.js`, `manifest.json`), add AES-256-GCM end-to-end encrypted cross-device sync (Windows ↔ Android ↔ MacBook) via Smart-Merge `.enc.json` and optional free Google Drive AppData sync, add CSV export, and polish Android/Windows/macOS ergonomics.

```markdown
Using the Shared Context and the Phase 1–3 codebase in `C:\Sudhansu\AI projects\expence-tracker`, execute **Phase 4 ONLY**.

### 1. Offline-First PWA (`manifest.json`, `sw.js`, `assets\icons\`)
- Create `manifest.json` with app name, short name, Material You theme/background colors, `display: "standalone"`, local SVG/PNG icons (`192x192`, `512x512`, maskable), and `share_target` (so Android users can share SMS/notification text straight to the Phase 3 parser).
- Create `sw.js` with a versioned **Cache-First precache strategy** for all local HTML, CSS, JS, and icon assets so the app loads instantaneously with **zero internet connection** on Android, Windows, and macOS.
- Show a subtle "Update Available — Reload" toast when a new Service Worker activates, and an optional non-intrusive "Install / Add to Home Screen" banner when `beforeinstallprompt` fires.

### 2. Smart-Merge Engine & AES-256-GCM Encrypted Backup / Restore (`js\sync.js`)
- **Encrypted Export (`.enc.json`)**:
  - Export all vault collections into a single JSON snapshot encrypted with **AES-256-GCM** using a user-chosen Sync/Backup Passphrase (derived via `PBKDF2-SHA256`, 210,000+ iterations, random salt + IV). Format: `{ version, kdf: 'PBKDF2-SHA256', iterations, saltB64, ivB64, ciphertextB64 }`.
- **Smart-Merge Restore / Sync**:
  - Decrypt incoming `.enc.json` payload and merge record-by-record by `id` using last-write-wins (`updatedAt`) while respecting `deletedAt` tombstones — so edits made offline on Android and Windows/MacBook combine cleanly without overwriting each other.
  - Also offer an explicit "Replace Local Vault" option with confirmation.
- **CSV Export**:
  - Export filtered or full transactions (including split rows, `#tags`, wallet name, category name, and self-transfer flag) as clean RFC-4180 CSV with UTF-8 BOM so Excel/Numbers/Google Sheets open INR (`₹`) symbols cleanly.

### 3. Optional Free End-to-End Encrypted Google Drive Sync (`js\sync.js`, `js\views\settings.js`)
- Implement a 100% client-side, free **Google Drive `appDataFolder` Sync** module (using user-supplied OAuth Client ID via standard Google OAuth PKCE / GIS token flow — zero backend server needed, zero cost):
  - Encrypts the full snapshot locally with `AES-256-GCM` using the user's Sync Passphrase **before** uploading `cashew-vault.enc.json` to the user's private Google Drive `appDataFolder`.
  - On sync: downloads remote `cashew-vault.enc.json`, decrypts locally, runs the **Smart-Merge Engine**, re-encrypts, and uploads if local changes exist.
  - Works seamlessly across **Android, Windows, and macOS** — Google Drive only ever sees opaque AES-256-GCM ciphertext.
  - Include a clear in-app setup guide and a "Test Connection / Sync Now / Disconnect" UI.

### 4. Cross-Platform Ergonomics & Final Verification (`js\app.js`, `css\components.css`)
- **Windows & macOS Desktop**: Keyboard shortcuts (`N` = New Transaction, `/` = Search, `1–5` = Switch Tabs, `H` = Toggle Hide Amounts, `L` = Lock Vault, `Esc` = Close Modal) + shortcut cheat sheet (`?`).
- **Android Mobile**: Smooth touch targets (≥ 44px), safe-area-inset padding for notches/gesture bars, swipe-to-delete/edit on transaction rows, and haptic feedback (`navigator.vibrate` where supported).
- **Offline & Security Verification Checklist**:
  - Verify 100% functionality in DevTools **Offline** mode after first load.
  - Verify zero external requests in the Network tab during normal offline operation.
  - Verify `.enc.json` backup cannot be decrypted with a wrong passphrase and merges cleanly across two browser profiles simulating Android + Windows.
```

---

## PHASE 5 PROMPT (OPTIONAL) — Android Native Companion Bridge for Zero-Touch Real-Time SMS, Credit Card Bill & UPI Capture

> **When to Use Phase 5**: Phases 0–4 already give you a complete, zero-install, offline PWA for Android, Windows, and macOS. Run Phase 5 **only** if you also want an optional lightweight Android APK wrapper that reads incoming Android bank SMS, Credit Card Bill SMS, and GPay/PhonePe/Paytm notifications **automatically in the background** (something Android OS blocks mobile browsers from doing).

```markdown
Using the Shared Context and the completed PWA in `C:\Sudhansu\AI projects\expence-tracker`, execute **Phase 5 (Optional)**: create a lightweight **Capacitor Android companion wrapper** in `C:\Sudhansu\AI projects\expence-tracker\android-bridge\` that wraps the existing static PWA without duplicating any UI or parser logic.

### Required Native Android Capabilities (100% On-Device, Zero External Servers)
1. **On-Device SMS Receiver & Credit Card Bill Scanner**:
   - Request runtime `RECEIVE_SMS` / `READ_SMS` permissions with a clear in-app privacy disclosure explaining that SMS are parsed strictly on-device and never uploaded.
   - Listen for incoming bank/card sender IDs (e.g., `*-HDFCBK`, `*-ICICIB`, `*-SBIINB`, `*-SBICRD`, `*-AXISBK`, `*-KOTAKB`, `*-AMEXIN`, `*-IDFCFB`, `*-ONECARD`) and forward `{ source: 'sms', sender, body, timestamp }` into `window.CashewBridge.onIncomingMessage(...)` (or queue locally in Android SharedPreferences/SQLite while the app is closed and flush on next unlock).
   - Provide a one-tap **"Scan Last 30 Days Credit Card Bill SMS"** action to immediately detect unpaid credit card bills and schedule reminders.
2. **Real-Time UPI Notification Listener (`NotificationListenerService`)**:
   - Listen strictly to whitelisted payment packages (`com.google.android.apps.nbu.paisa.user` [GPay], `com.phonepe.app` [PhonePe], `net.one97.paytm` [Paytm], `com.dreamplug.androidapp` [CRED]) and pass notification title/text locally into `window.CashewBridge.onIncomingMessage(...)`.
3. **Native Android Local Scheduled Notifications**:
   - Schedule reliable OS-level local notifications (even when the app is closed) for:
     - **Credit Card Bill Reminders** (5 days before, 2 days before, due date morning, and overdue) showing Card Name, Total Due, and Min Due.
     - **Category Cap 75% & 100% Alerts** triggered right after an auto-parsed debit.
     - **EMI / Bill / Subscription Pre-Due Reminders**.
4. **Native Android Biometric Prompt**:
   - Wire Android `BiometricPrompt` (Fingerprint / Face Unlock) to unlock the existing Phase 1 encrypted vault seamlessly.

### Verification & Build Guide
- Provide step-by-step instructions in `android-bridge\README.md` to build the signed/debug APK locally on Windows/macOS via Android Studio or Gradle — keeping the app 100% free, self-hosted, and privacy-first.
```
