# How to Run CashewFlow on Windows, macOS, and Android

CashewFlow is a **100% free, offline-first, AES-256-GCM encrypted** expense & budget tracker.
Because it uses browser **Web Crypto (`AES-256-GCM` / `PBKDF2`)**, **ES Modules**, and a **Service Worker**, it should be opened via `http://localhost` (on desktop) or `https://` (for Android / cross-device PWA).

> **Quick Note on Prototype vs. Full App**
> - **UI Prototype (`prototype/index.html`)**: You can double-click it directly in any browser (no server needed) just to preview the design.
> - **Full Encrypted App (`index.html`)**: Follow the platform steps below so encryption, offline caching, and PWA install work properly.

---

## 1. Windows (Chrome / Edge / Brave)

### Option A — Run Locally in 1 Command (No Installation)
1. Open **PowerShell** or **Command Prompt**.
2. Run one of the following commands (whichever tool you have installed):

   **Using Python (recommended):**
   ```powershell
   python -m http.server 8080 --directory "C:\Sudhansu\AI projects\expence-tracker"
   ```

   **Or using Node.js:**
   ```powershell
   npx serve "C:\Sudhansu\AI projects\expence-tracker" -l 8080
   ```

3. Open your browser and go to:
   ```text
   http://localhost:8080
   ```
4. **Optional — Use as a Standalone Desktop App**:
   - In Chrome or Edge, click the **Install App** icon in the address bar (or the **Install App** button in the CashewFlow top bar).
   - It will appear in your Windows Start Menu and run in its own window.
5. **First-Run Vault Setup**:
   - Enter a local Username, Master Password (min 6 chars), and optional 4–6 digit Quick PIN.
   - **Save your Recovery Key** (copy or download `.txt`) before entering the vault.

---

## 2. Apple macOS (Safari / Chrome / Edge)

1. Copy the `expence-tracker` folder to your Mac (e.g., `~/Documents/expence-tracker`).
2. Open **Terminal** and run:

   **Using Python 3 (built into macOS):**
   ```bash
   python3 -m http.server 8080 --directory ~/Documents/expence-tracker
   ```

   **Or using Node.js:**
   ```bash
   npx serve ~/Documents/expence-tracker -l 8080
   ```

3. Open **Safari** or **Chrome** and go to:
   ```text
   http://localhost:8080
   ```
4. **Optional — Add to macOS Dock**:
   - **Safari (macOS Sonoma+)**: Menu bar → **File → Add to Dock…**
   - **Chrome**: Click the **Install** icon in the right side of the address bar.

---

## 3. Android (Zero-Install Offline PWA — Recommended)

Android browsers require **HTTPS** (not a local `file://` path) to enable AES-256-GCM encryption, offline Service Worker caching, and "Add to Home Screen".

### Best Free Way (Works on Android, Windows & Mac from Anywhere)
Host the static folder for **free** on **GitHub Pages** or **Cloudflare Pages** (zero backend, your data never touches the host — it stays encrypted inside your device's `IndexedDB`):

1. Upload the contents of `C:\Sudhansu\AI projects\expence-tracker` to a GitHub repository (or drag-and-drop the folder into Cloudflare Pages).
2. Enable **GitHub Pages** (*Settings → Pages → Deploy from branch → `main` / root*).
3. Open your free HTTPS URL (e.g., `https://<username>.github.io/expence-tracker/`) in **Chrome on Android**.
4. Tap **⋮ (Menu) → Add to Home screen → Install**.
5. Once opened once, the **Service Worker caches everything** — you can turn on **Airplane Mode** and CashewFlow will continue working **100% offline**.

### Using SMS / Credit Card Bill Parsing on Android (PWA Mode)
- Open **Smart Capture** inside the app and paste any bank debit SMS, GPay/PhonePe/Paytm alert, or Credit Card statement SMS — or use Android's **Share** menu to share SMS text directly into CashewFlow.
- All parsing runs **100% on-device** with zero server calls.

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
