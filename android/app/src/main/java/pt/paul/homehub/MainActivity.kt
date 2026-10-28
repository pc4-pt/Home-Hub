package pt.paul.homehub

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray
import org.json.JSONObject

/**
 * Full-screen WebView showing the hub web app. Video is handed to [PlayerActivity]
 * (native ExoPlayer) and other apps are launched through [HubBridge].
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private val hubUrl: String get() = BuildConfig.HUB_URL

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        web = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0D12"))
            isFocusable = true
            isFocusableInTouchMode = true
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
            }
            addJavascriptInterface(HubBridge(this@MainActivity), "HubNative")
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val url = request.url.toString()
                    if (url.startsWith("retry:")) { view.loadUrl(hubUrl); return true }
                    // Stay inside the hub; anything else (e.g. web links from the Apps row) is ignored on TV.
                    return !url.startsWith(hubUrl)
                }

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) showOffline(error.description?.toString() ?: "network error")
                }
            }
        }
        setContentView(web)
        web.requestFocus()
        web.loadUrl(hubUrl)
    }

    private fun showOffline(reason: String) {
        val html = """
            <html><body style="background:#0b0d12;color:#eef0f5;font-family:sans-serif;display:flex;
            align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
            <div><h1 style="font-size:32px">Can't reach the hub</h1>
            <p style="color:#8d94a6;font-size:18px">$hubUrl<br>$reason</p>
            <a href="retry:" autofocus style="display:inline-block;margin-top:20px;padding:12px 30px;border-radius:30px;
            background:#ffb547;color:#1a1203;text-decoration:none;font-size:20px">Try again</a></div>
            <script>document.querySelector('a').focus()</script></body></html>
        """.trimIndent()
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }

    /** Send a key name to the web app (for keys a WebView doesn't turn into DOM events). */
    private fun forwardKey(name: String) {
        web.evaluateJavascript("window.hubNativeKey && window.hubNativeKey('$name')", null)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val name = when (event.keyCode) {
                KeyEvent.KEYCODE_MENU -> "menu"
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> "playpause"
                KeyEvent.KEYCODE_MEDIA_REWIND -> "rewind"
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "ffwd"
                KeyEvent.KEYCODE_CHANNEL_UP -> "chup"
                KeyEvent.KEYCODE_CHANNEL_DOWN -> "chdown"
                else -> null
            }
            if (name != null) { forwardKey(name); return true }
        }
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                // Ask the web app first; if it has nothing to close, go to the Fire TV home.
                web.evaluateJavascript("!!(window.hubNativeBack && window.hubNativeBack())") { handled ->
                    if (handled != "true") moveTaskToBack(true)
                }
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    // ---- called by HubBridge (always on the UI thread) ----

    fun startPlayer(json: String) {
        val intent = Intent(this, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_PLAYLIST, json)
        startActivityForResult(intent, REQ_PLAYER)
    }

    fun openStore(pkg: String) {
        for (uri in listOf("amzn://apps/android?p=$pkg", "market://details?id=$pkg")) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            } catch (_: Exception) { /* try the next store */ }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_PLAYER || data == null) return
        // Replay what happened during playback (plays, failures, last channel) into the web app.
        val events = JSONArray(data.getStringExtra(PlayerActivity.EXTRA_EVENTS) ?: "[]")
        for (i in 0 until events.length()) {
            val e = events.getJSONObject(i)
            emit(e.getString("type"), JSONObject().put("id", e.optString("id")))
        }
        emit("closed", JSONObject().put("id", data.getStringExtra(PlayerActivity.EXTRA_LAST_ID) ?: ""))
        web.requestFocus()
    }

    private fun emit(type: String, payload: JSONObject) {
        val js = "window.hubNativeEvent && window.hubNativeEvent(${JSONObject.quote(type)}, ${JSONObject.quote(payload.toString())})"
        web.evaluateJavascript(js, null)
    }

    override fun onResume() { super.onResume(); web.onResume() }
    override fun onPause() { web.onPause(); super.onPause() }
    override fun onDestroy() { web.destroy(); super.onDestroy() }

    companion object { private const val REQ_PLAYER = 7 }
}
