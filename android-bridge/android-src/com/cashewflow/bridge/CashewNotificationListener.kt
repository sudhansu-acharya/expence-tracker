package com.cashewflow.bridge

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * 100% On-Device UPI Notification Listener.
 * Reads ONLY whitelisted UPI payment apps (GPay, PhonePe, Paytm, CRED) and forwards
 * locally to window.CashewBridge.onIncomingMessage.
 */
class CashewNotificationListener : NotificationListenerService() {
    private val allowedPackages = setOf(
        "com.google.android.apps.nbu.paisa.user", // Google Pay
        "com.phonepe.app",                        // PhonePe
        "net.one97.paytm",                        // Paytm
        "com.dreamplug.androidapp"                // CRED
    )

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val pkg = sbn.packageName ?: return
        if (pkg !in allowedPackages) return
        val extras = sbn.notification.extras ?: return
        val title = extras.getCharSequence("android.title")?.toString().orEmpty()
        val text = extras.getCharSequence("android.text")?.toString().orEmpty()
        val combined = "$title: $text".trim()
        if (combined.isBlank()) return

        CashewBridgePlugin.enqueueOrDispatch(
            context = applicationContext,
            source = "upi_notif",
            sender = pkg,
            body = combined,
            timestamp = sbn.postTime
        )
    }
}
