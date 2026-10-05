package com.nexonai.trustline.agent.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

/** Scans the activation QR code shown in the operator portal. Calls onResult once with the raw text. */
@Composable
fun QrScanner(onResult: (String) -> Unit, onClose: () -> Unit) {
    val ctx = LocalContext.current
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) launcher.launch(Manifest.permission.CAMERA) }

    Column(Modifier.fillMaxWidth().padding(8.dp)) {
        if (granted) CameraPreview(onResult) else {
            Text("Camera permission is needed to scan the QR code. You can also type the code by hand.")
            Button(onClick = { launcher.launch(Manifest.permission.CAMERA) }, modifier = Modifier.padding(top = 8.dp)) { Text("Allow camera") }
        }
        OutlinedButton(onClick = onClose, modifier = Modifier.padding(top = 8.dp)) { Text("Cancel") }
    }
}

@Composable
private fun CameraPreview(onResult: (String) -> Unit) {
    val ctx = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember { BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()) }
    var done by remember { mutableStateOf(false) }
    AndroidView(modifier = Modifier.fillMaxWidth().height(340.dp), factory = { c ->
        val view = PreviewView(c)
        val future = ProcessCameraProvider.getInstance(c)
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
            val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
            analysis.setAnalyzer(executor) { proxy ->
                val media = proxy.image
                if (media == null || done) { proxy.close(); return@setAnalyzer }
                scanner.process(InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees))
                    .addOnSuccessListener { codes ->
                        val text = codes.firstOrNull()?.rawValue
                        if (text != null && !done) { done = true; onResult(text) }
                    }
                    .addOnCompleteListener { proxy.close() }
            }
            provider.unbindAll()
            provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        }, ContextCompat.getMainExecutor(c))
        view
    })
}
