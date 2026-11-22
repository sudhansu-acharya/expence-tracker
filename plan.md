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
