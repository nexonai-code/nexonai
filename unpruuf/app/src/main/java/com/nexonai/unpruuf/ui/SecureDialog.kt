package com.nexonai.unpruuf.ui

import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy

/**
 * Every dialog opens its own window. The app's main window carries FLAG_SECURE (no screenshots, no
 * screen recording, blank in the app switcher); Compose dialogs are meant to inherit that flag,
 * but the flag is set explicitly on each dialog as well, so a dialog showing a pairing code, a node
 * owner secret or a message can never end up capturable because of a library default.
 */
val SecureDialogProperties = DialogProperties(securePolicy = SecureFlagPolicy.SecureOn)
