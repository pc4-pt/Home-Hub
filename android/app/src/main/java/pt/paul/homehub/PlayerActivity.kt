package pt.paul.homehub

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject

/**
 * Native live-TV player. Up/Down or CH+/CH- zap through the list the web app passed in;
 * OK shows the channel banner; Back returns to the hub with a log of what happened.
 */
@OptIn(UnstableApi::class)
class PlayerActivity : Activity() {

    private data class Channel(val id: String, val name: String, val url: String, val ref: String, val ua: String)

    private lateinit var channels: List<Channel>
    private var index = 0
    private var player: ExoPlayer? = null
    private lateinit var view: PlayerView
    private lateinit var osd: LinearLayout
    private lateinit var osdNum: TextView
    private lateinit var osdName: TextView
    private lateinit var message: TextView
    private val events = JSONArray()
    private var reportedPlaying = false
    private val ui = Handler(Looper.getMainLooper())
    private val hideOsd = Runnable { osd.visibility = View.GONE }
    private val zap = Runnable { load() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val data = JSONObject(intent.getStringExtra(EXTRA_PLAYLIST) ?: "{}")
        val items = data.optJSONArray("items") ?: JSONArray()
        channels = (0 until items.length()).map { i ->
            val o = items.getJSONObject(i)
            Channel(o.optString("id"), o.optString("name"), o.optString("url"), o.optString("ref"), o.optString("ua"))
        }
        if (channels.isEmpty()) { finish(); return }
        index = data.optInt("index", 0).coerceIn(0, channels.size - 1)

        buildUi()
        player = ExoPlayer.Builder(this)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            .build()
            .also { p ->
                view.player = p
                p.playWhenReady = true
                p.addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        if (state == Player.STATE_READY) {
                            message.visibility = View.GONE
                            if (!reportedPlaying) { reportedPlaying = true; log("playing") }
                        }
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        // Live streams sometimes fall behind the window: just rejoin the live edge.
                        if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                            player?.seekToDefaultPosition(); player?.prepare(); return
                        }
                        log("error")
                        showMessage("This channel isn't playing from here right now.\nIt may be limited to the UK or US.\n\n▲ ▼ change channel   ·   Back to return")
                    }
                })
            }
        load()
    }

    private fun buildUi() {
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        view = PlayerView(this).apply {
            useController = false
            resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
            keepScreenOn = true
        }
        root.addView(view, FrameLayout.LayoutParams(-1, -1))

        message = TextView(this).apply {
            setTextColor(Color.parseColor("#EEF0F5")); textSize = 22f; gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#CC000000")); setPadding(60, 40, 60, 40); visibility = View.GONE
        }
        root.addView(message, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER))

        osdNum = TextView(this).apply { setTextColor(Color.parseColor("#FFB547")); textSize = 34f; typeface = Typeface.DEFAULT_BOLD }
        osdName = TextView(this).apply { setTextColor(Color.WHITE); textSize = 26f; typeface = Typeface.DEFAULT_BOLD; setPadding(32, 0, 0, 0) }
        osd = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(64, 120, 64, 56)
            background = GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, intArrayOf(Color.TRANSPARENT, Color.parseColor("#E6000000")))
            addView(osdNum); addView(osdName)
        }
        root.addView(osd, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
        setContentView(root)
    }

    private fun load() {
        val ch = channels[index]
        reportedPlaying = false
        message.visibility = View.GONE
        showOsd()
        val http = DefaultHttpDataSource.Factory()
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(10_000)
            .setReadTimeoutMs(15_000)
            .setUserAgent(ch.ua.ifEmpty { "Mozilla/5.0 (Linux; Android 9; AFTKA) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36" })
        if (ch.ref.isNotEmpty()) http.setDefaultRequestProperties(mapOf("Referer" to ch.ref))
        val item = MediaItem.Builder().setUri(ch.url)
            .apply { if (!ch.url.contains(".mpd") && !ch.url.contains(".mp4")) setMimeType(MimeTypes.APPLICATION_M3U8) }
            .build()
        val source = DefaultMediaSourceFactory(http).createMediaSource(item)
        player?.apply { setMediaSource(source); prepare(); play() }
    }

    private fun showOsd() {
        osdNum.text = (index + 1).toString()
        osdName.text = channels[index].name
        osd.visibility = View.VISIBLE
        ui.removeCallbacks(hideOsd)
        ui.postDelayed(hideOsd, 5000)
    }

    private fun showMessage(text: String) {
        message.text = text
        message.visibility = View.VISIBLE
        showOsd()
    }

    private fun step(delta: Int) {
        index = (index + delta + channels.size) % channels.size
        player?.stop()
        showOsd()
        // Debounce so pressing ▼ three times quickly only tunes once.
        ui.removeCallbacks(zap)
        ui.postDelayed(zap, 450)
    }

    private fun log(type: String) {
        events.put(JSONObject().put("type", type).put("id", channels[index].id))
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event)
        when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_CHANNEL_UP -> { step(-1); return true }
            KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_CHANNEL_DOWN -> { step(+1); return true }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_DPAD_LEFT,
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MENU -> { showOsd(); return true }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                player?.let { if (it.isPlaying) it.pause() else it.play() }
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun finish() {
        if (::channels.isInitialized && channels.isNotEmpty()) {
            setResult(RESULT_OK, Intent()
                .putExtra(EXTRA_EVENTS, events.toString())
                .putExtra(EXTRA_LAST_ID, channels[index].id))
        }
        super.finish()
    }

    override fun onStop() {
        super.onStop()
        // Leaving the player (Home button etc.) should not keep a stream running.
        if (!isFinishing) finish()
    }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        player?.release()
        player = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_PLAYLIST = "playlist"
        const val EXTRA_EVENTS = "events"
        const val EXTRA_LAST_ID = "lastId"
    }
}
