# How to Run CashewFlow on Windows, macOS, Android, and iPhone/iPad (iOS)

CashewFlow is a **100% free, offline-first, AES-256-GCM encrypted** expense, budget & investment tracker.
Because it uses browser **Web Crypto (`AES-256-GCM` / `PBKDF2`)**, **ES Modules**, and a **Service Worker**, open it via `http://localhost` (on desktop) or your HTTPS link `https://sudhansu-acharya.github.io/expence-tracker/` (on Android, iOS, Windows, or macOS).

---

## 1. Windows (Local — 1-Click Launch)

### Option A — Double-Click Launcher (Easiest)
1. Open `C:\Sudhansu\AI projects\expence-tracker`.
2. Double-click **`Start-CashewFlow.bat`**.
3. It automatically starts the local server (using Python or Node.js) and opens **`http://localhost:8080`** in your browser.
4. Keep the small black terminal window open while using the app (close it when done).

### Option B — Run from PowerShell
```powershell
python -m http.server 8080 --bind 127.0.0.1 --directory "C:\Sudhansu\AI projects\expence-tracker"
```
Then open **`http://localhost:8080`** in Chrome, Edge, or Brave.
- **Optional Desktop App Window**: Click the **Install** icon in the address bar (or **Install App** in CashewFlow's top bar) to pin it to your Windows Start Menu.

---

## 2. Apple macOS (Safari / Chrome / Edge)

1. Copy the `expence-tracker` folder to your Mac (e.g., `~/Documents/expence-tracker`).
2. Double-click **`start-cashewflow.command`** (or run in Terminal):
   ```bash
   python3 -m http.server 8080 --bind 127.0.0.1 --directory ~/Documents/expence-tracker
   ```
3. Open **`http://localhost:8080`** in Safari or Chrome.
4. **Add to Dock**: In Safari → **File → Add to Dock…** (or Chrome → **Install** icon).

---

## 3. Android (Chrome PWA — Offline & Home Screen Icon)

1. Open **Google Chrome** (normal tab, not Incognito) on your Android phone and go to:
   ```text
   https://sudhansu-acharya.github.io/expence-tracker/
   ```
2. Tap **⋮ (three dots) → Add to Home screen → Install**.
3. Open **CashewFlow** from your home screen — it caches everything via Service Worker and works **100% offline**.
4. **Daily/Weekly/Yearly Reminders**: Go to **Settings → Expense Update Reminder** to enable notifications or tap **Add to Phone/PC Calendar (`.ics`)** for guaranteed OS alarms even when Chrome is closed.

---

## 4. iPhone & iPad (iOS / iPadOS Safari PWA)

iOS requires **Safari** (not Chrome) to install full-screen offline web apps:
1. Open **Safari** on your iPhone/iPad and go to:
   ```text
   https://sudhansu-acharya.github.io/expence-tracker/
   ```
2. Tap the **Share** button (square with upward arrow at the bottom of Safari).
3. Scroll down and tap **Add to Home Screen** → tap **Add**.
4. Open **CashewFlow** from your iPhone/iPad home screen:
   - Runs full-screen with Liquid Glass status bar blending (`black-translucent`), safe-area notch/home-bar padding, no input auto-zoom, and **100% offline** caching.
   - For notifications on iOS 16.4+: open the installed Home Screen app → **Settings → Expense Update Reminder → Enable** (and/or tap **Add to Phone/PC Calendar (`.ics`)** to add a recurring Apple Calendar alarm).

---

## 4. Android Optional Native Bridge (Hands-Free Automatic SMS & UPI Capture)

If you want **automatic background reading** of incoming Indian Bank SMS, **Credit Card Bill due SMS**, and GPay/PhonePe/Paytm notifications (which Android blocks mobile browsers from doing silently):

1. Open `C:\Sudhansu\AI projects\expence-tracker\android-bridge\README.md`.
2. Build the lightweight **Capacitor Android APK** locally using Android Studio (100% free, 100% on-device parsing via `CashewSmsReceiver.kt` and `CashewNotificationListener.kt`).
3. Install the APK on your Android phone and grant SMS / Notification access.

---

## 5. How to Sync Data Between Windows, Android, and macOS (Free & Encrypted)

1. **Offline Smart-Merge `.enc.json` (Zero Cloud Needed)**:
   - Open **Settings & Sync** → enter a Backup Passphrase → click **Export `.enc.json`**.
   - Transfer that encrypted file to your other device (USB, AirDrop, Nearby Share, WhatsApp/Telegram to self, Drive, etc.).
   - On the other device, enter the same passphrase → click **Smart-Merge Import (`.enc.json`)**.
   - Offline edits from both devices are merged automatically by record ID and timestamp without overwriting each other.
2. **Optional Free Google Drive Sync (E2E Encrypted)**:
   - Open **Settings & Sync** → paste a Google OAuth token with `drive.appdata` scope + your E2E Sync Passphrase → click **Sync Encrypted Now**.
   - Your data is encrypted locally with **AES-256-GCM** *before* upload — Google Drive only stores ciphertext.

---

## 6. Useful Desktop Keyboard Shortcuts (Windows / macOS)

| Key | Action |
| --- | --- |
| `N` | Open **Add Transaction** modal |
| `/` | Jump to **Transactions Search** |
| `1` – `5` | Switch tabs (Dashboard, Transactions, Budgets, Capture, Settings) |
| `H` | Toggle **Hide Amounts** privacy mode |
| `L` | **Lock Vault** immediately |
| `Esc` | Close active modal |
