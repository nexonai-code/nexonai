package com.nexonai.unpruuf.screens.qrpair

import com.journeyapps.barcodescanner.CaptureActivity

/**
 * QR-Scanner, der über die Manifest-Deklaration im Hochformat fixiert ist.
 * Verhindert den Wechsel ins Querformat beim Scannen (und den damit
 * verbundenen Verlust des Compose-States beim Zurückkehren).
 */
class PortraitCaptureActivity : CaptureActivity()
