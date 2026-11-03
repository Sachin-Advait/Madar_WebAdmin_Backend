package com.madar.madar_tv

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

class MainActivity : FlutterActivity() {
    private val rendererExecutor = Executors.newSingleThreadExecutor()

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.madar.tv/pdf")
            .setMethodCallHandler { call, result ->
                if (call.method != "render") { result.notImplemented(); return@setMethodCallHandler }
                val requestedPath = call.argument<String>("path")
                val requestedPage = call.argument<Int>("page") ?: 0
                val requestedWidth = (call.argument<Int>("width") ?: 1600).coerceIn(600, 2000)
                rendererExecutor.execute {
                    try {
                        val file = File(requireNotNull(requestedPath)).canonicalFile
                        require(file.path.startsWith(filesDir.canonicalPath + File.separator)) { "Only verified application documents may be opened" }
                        require(file.isFile && file.length() <= 100L * 1024 * 1024) { "Document is unavailable or too large" }
                        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
                            PdfRenderer(descriptor).use { renderer ->
                                val pageCount = renderer.pageCount
                                require(requestedPage in 0 until renderer.pageCount) { "Page is outside this document" }
                                renderer.openPage(requestedPage).use { page ->
                                    val scale = minOf(requestedWidth.toFloat() / page.width, 2600f / page.height)
                                    val bitmap = Bitmap.createBitmap((page.width * scale).toInt().coerceAtLeast(1), (page.height * scale).toInt().coerceAtLeast(1), Bitmap.Config.ARGB_8888)
                                    try {
                                        bitmap.eraseColor(Color.WHITE)
                                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                                        val bytes = ByteArrayOutputStream().use { stream -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream); stream.toByteArray() }
                                        runOnUiThread { if (!isDestroyed) result.success(mapOf("bytes" to bytes, "pages" to pageCount)) }
                                    } finally { bitmap.recycle() }
                                }
                            }
                        }
                    } catch (error: Exception) {
                        runOnUiThread { if (!isDestroyed) result.error("PDF_RENDER", error.message ?: "Document could not be rendered", null) }
                    }
                }
            }
    }

    override fun onDestroy() { rendererExecutor.shutdownNow(); super.onDestroy() }
}
