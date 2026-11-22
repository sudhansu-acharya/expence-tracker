package com.cashewflow.bridge

import android.content.Context
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
 */
@CapacitorPlugin(name = "CashewBridge")
class CashewBridgePlugin : Plugin() {
    companion object {
        private const val PREFS = "cashew_pending_msgs"
        private const val KEY_QUEUE = "queue_json"
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
    fun flushQueuedMessages(call: PluginCall) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_QUEUE, "[]") ?: "[]"
        prefs.edit().putString(KEY_QUEUE, "[]").apply()
        val ret = JSObject().apply { put("messagesJson", raw) }
        call.resolve(ret)
    }
}
