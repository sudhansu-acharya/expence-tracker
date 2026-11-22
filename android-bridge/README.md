# CashewFlow — Phase 5 Optional Android Native Companion Bridge

The main CashewFlow PWA in the parent folder works **100% offline with zero installation** on Android, Windows, and macOS.

Use this optional **Capacitor Android Bridge** only if you want **hands-free background capture** of:
- Indian Bank Debit/Credit SMS
- **Credit Card Statement / Bill Due SMS** (HDFC, ICICI, SBI, Axis, Kotak, Amex, IDFC, OneCard, etc.)
- Real-time UPI notifications (Google Pay, PhonePe, Paytm, CRED)
- OS-level scheduled local notifications for Credit Card Bill due dates (5d, 2d, due day) and 75%/100% category cap alerts

All parsing stays **100% on-device** using the exact same `js/parser.js` engine — zero raw SMS or notifications are ever uploaded.

## Local Build Steps (100% Free, No Cloud Build Service)
1. Install Node.js (LTS) and Android Studio (SDK 34+).
2. Inside `C:\Sudhansu\AI projects\expence-tracker\android-bridge`:
   ```bash
   npm install
   npx cap add android
   npx cap sync android
   ```
3. Copy the Kotlin files from `android-src/com/cashewflow/bridge/` into `android/app/src/main/java/com/cashewflow/bridge/`.
4. Register `RECEIVE_SMS`, `READ_SMS`, `POST_NOTIFICATIONS`, `CashewSmsReceiver`, and `CashewNotificationListener` in `android/app/src/main/AndroidManifest.xml`.
5. Run `npx cap open android` and build your signed or debug APK directly onto your Android phone.
