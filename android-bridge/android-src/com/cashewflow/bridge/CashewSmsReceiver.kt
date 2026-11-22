package com.cashewflow.bridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

/**
 * 100% On-Device Bank & Credit Card Bill SMS Receiver.
 * Filters strictly for Indian bank/card sender IDs and forwards to local JS parser
 * (window.CashewBridge.onIncomingMessage) without sending raw SMS to any server.
 */
class CashewSmsReceiver : BroadcastReceiver() {
    private val bankSenders = listOf(
        "HDFCBK", "ICICIB", "SBIINB", "SBICRD", "AXISBK",
        "KOTAKB", "AMEXIN", "IDFCFB", "ONECARD", "RBLBNK", "INDUSB"
    )

    override fun onReceive(context: Context, intent: Intent) {
        if (Telephony.Sms.Intents.SMS_RECEIVED_ACTION != intent.action) return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        for (sms in messages) {
            val sender = sms.originatingAddress ?: continue
            val upper = sender.uppercase()
            if (bankSenders.none { upper.contains(it) }) continue
            val body = sms.messageBody ?: continue
            CashewBridgePlugin.enqueueOrDispatch(
                context = context,
                source = "sms",
                sender = sender,
                body = body,
                timestamp = sms.timestampMillis
            )
        }
    }
}
