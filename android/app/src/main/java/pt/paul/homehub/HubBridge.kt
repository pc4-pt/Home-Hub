package pt.paul.homehub

import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/** Exposed to the web app as window.HubNative. JS calls arrive on a background thread. */
class HubBridge(private val activity: MainActivity) {

    private val pm: PackageManager get() = activity.packageManager
    @Volatile private var appsCache: String? = null

    @JavascriptInterface
    fun play(json: String) {
        activity.runOnUiThread { activity.startPlayer(json) }
    }

    @JavascriptInterface
    fun version(): String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

    /** Launchable apps with their TV banner (or icon) as a data URL: [{pkg, label, banner?|icon?}] */
    @JavascriptInterface
    fun listApps(): String {
        appsCache?.let { return it }
        val seen = LinkedHashMap<String, JSONObject>()
        val own = activity.packageName
        fun add(list: List<ResolveInfo>, tv: Boolean) {
            for (ri in list) {
                val pkg = ri.activityInfo.packageName
                if (pkg == own || seen.containsKey(pkg)) continue
                val o = JSONObject().put("pkg", pkg).put("label", ri.loadLabel(pm).toString())
                val banner = if (tv) ri.activityInfo.loadBanner(pm) ?: ri.activityInfo.applicationInfo.loadBanner(pm) else null
                if (banner != null) o.put("banner", toDataUrl(banner, 320, 180))
                else o.put("icon", toDataUrl(ri.loadIcon(pm), 128, 128))
                seen[pkg] = o
            }
        }
        add(query(Intent.CATEGORY_LEANBACK_LAUNCHER), tv = true)
        add(query(Intent.CATEGORY_LAUNCHER), tv = false)
        val arr = JSONArray()
        seen.values.sortedBy { it.getString("label").lowercase() }.forEach { arr.put(it) }
        return arr.toString().also { appsCache = it }
    }

    @JavascriptInterface
    fun launch(pkg: String): Boolean {
        val intent = pm.getLeanbackLaunchIntentForPackage(pkg) ?: pm.getLaunchIntentForPackage(pkg) ?: return false
        return try {
            activity.runOnUiThread { activity.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            true
        } catch (_: Exception) {
            false
        }
    }

    @JavascriptInterface
    fun openStore(pkg: String) {
        activity.runOnUiThread { activity.openStore(pkg) }
    }

    private fun query(category: String): List<ResolveInfo> =
        pm.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(category), 0)

    private fun toDataUrl(d: Drawable, w: Int, h: Int): String {
        val bmp = if (d is BitmapDrawable && d.bitmap != null) {
            Bitmap.createScaledBitmap(d.bitmap, w, h, true)
        } else {
            Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { b ->
                val c = Canvas(b)
                d.setBounds(0, 0, w, h)
                d.draw(c)
            }
        }
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }
}
