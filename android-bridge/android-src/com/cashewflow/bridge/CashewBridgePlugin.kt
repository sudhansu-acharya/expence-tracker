package com.cashewflow.bridge

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

/**
 * Capacitor Bridge Plugin connecting on-device SMS / UPI listeners to window.CashewBridge.
 * Queues messages locally in SharedPreferences while the app/vault is locked and flushes on unlock.
 * Also supports scanning the last N days of Indian Bank & Credit Card Bill SMS strictly on-device.
 */
@CapacitorPlugin(name = "CashewBridge")
class CashewBridgePlugin : Plugin() {
    companion object {
        private const val PREFS = "cashew_pending_msgs"
        private const val KEY_QUEUE = "queue_json"
        private val BANK_SENDERS = listOf(
            "HDFCBK", "ICICIB", "SBIINB", "SBICRD", "AXISBK",
            "KOTAKB", "AMEXIN", "IDFCFB", "ONECARD", "RBLBNK", "INDUSB", "YESBNK", "PNBSMS", "BOBSMS"
        )
        @Volatile private var activeInstance: CashewBridgePlugin? = null

        fun enqueueOrDispatch(context: Context, source: String, sender: String, body: String, timestamp: Long) {
            val payload = JSONObject().apply {
                put("source", source)
                put("sender", sender)
                put("body", body)
                put("timestamp", timestamp)
            }
            val instance = activeInstance
            if (instance != null) {
                val js = "window.CashewBridge && window.CashewBridge.onIncomingMessage(${payload});"
                instance.bridge.webView.post { instance.bridge.webView.evaluateJavascript(js, null) }
            } else {
                val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val arr = JSONArray(prefs.getString(KEY_QUEUE, "[]"))
                arr.put(payload)
                prefs.edit().putString(KEY_QUEUE, arr.toString()).apply()
            }
        }
    }

    override fun load() {
        activeInstance = this
    }

    @PluginMethod
    fun requestSmsPermissions(call: PluginCall) {
        val perms = mutableListOf(Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS)
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        ActivityCompat.requestPermissions(activity, perms.toTypedArray(), 4821)
        call.resolve(JSObject().apply { put("requested", true) })
    }

    @PluginMethod
    fun flushQueuedMessages(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
        prefs.edit().putString(KEY_QUEUE, "[]").apply()
        call.resolve(JSObject().apply { put("messagesJson", raw) })
    }

    @PluginMethod
    fun scanRecentSms(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            call.reject("READ_SMS permission not granted. Tap 'Grant SMS / Notification Permissions' first.")
            return
        }
        val days = call.getInt("days", 30) ?: 30
        val cutoff = System.currentTimeMillis() - (days.toLong() * 86_400_000L)
        val arr = JSONArray()

        val cursor = context.contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
            "${Telephony.Sms.DATE} >= ?",
            arrayOf(cutoff.toString()),
            "${Telephony.Sms.DATE} DESC"
        )
        cursor?.use {
            val idxAddr = it.getColumnIndex(Telephony.Sms.ADDRESS)
            val idxBody = it.getColumnIndex(Telephony.Sms.BODY)
            val idxDate = it.getColumnIndex(Telephony.Sms.DATE)
            while (it.moveToNext()) {
                val sender = it.getString(idxAddr).orEmpty()
                val upper = sender.uppercase()
                if (BANK_SENDERS.none { b -> upper.contains(b) }) continue
                val body = it.getString(idxBody).orEmpty()
                val ts = it.getLong(idxDate)
                arr.put(JSONObject().apply {
                    put("source", "sms")
                    put("sender", sender)
                    put("body", body)
                    put("timestamp", ts)
                })
            }
        }
        call.resolve(JSObject().apply { put("messagesJson", arr.toString()) })
    }
}
