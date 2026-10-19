import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.dagger.hilt.android")
    kotlin("kapt")
}

android {
    namespace = "com.nexonai.unpruuf"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.nexonai.unpruuf"
        minSdk = 26
        targetSdk = 34
        // Two-digit incrementing scheme requested by the user: 1.01, 1.02, 1.03, ...
        // Bump both fields together on every delivery — versionCode must strictly
        // increase for Play/internal distribution, versionName is what's shown in
        // Settings (see SettingsScreen's "App version" row). See STATUS.md "Versioning".
        versionCode = 18
        versionName = "1.17"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        // Build-freshness window — see MainActivity's expiry gate (checked right after the
        // root-detection gate, before anything else). Computed once, at Gradle configuration
        // time, not per-install: every install of this exact build shares the same hard
        // cutoff, ~6 months (180 days) after it was compiled. Independent of LicenseManager,
        // which is about paid usage, not build staleness — applies to every edition,
        // including the free Client edition, which has no license concept at all.
        buildConfigField(
            "long",
            "BUILD_EXPIRY_MS",
            "${System.currentTimeMillis() + 180L * 24 * 60 * 60 * 1000}L"
        )
    }

    // Fester NexonAI-Testschluessel fuer Debug-Builds: Wer die zwei Dateien unpruuf-test.jks und
    // keystore.properties in den Ordner unpruuf/ legt, baut Debug-APKs mit demselben Schluessel wie
    // jeder andere Build mit diesen Dateien (Updates ohne Deinstallieren, auch zwischen PC und
    // Cloud-Builds). Ohne die Dateien: normaler Android-Studio-Debug-Schluessel, nichts bricht.
    // Die Dateien stehen in .gitignore und gehoeren nie ins Repository. Nur fuer Tests, nie fuer Kunden.
    val testKeystoreProps = Properties().apply {
        val f = file("../keystore.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
    val testKeystoreFile = testKeystoreProps.getProperty("storeFile")?.let { file("../keystore.properties").resolveSibling(it) }
    // Release-Schluessel fuer Kunden-Builds: release.properties + unpruuf-release.jks in unpruuf/ (nie im
    // Repository). Fehlen sie, bleibt der Release-Build UNSIGNIERT, er faellt nie auf einen Test-Schluessel zurueck.
    val releaseKeystoreProps = Properties().apply {
        val f = file("../release.properties")
        if (f.exists()) f.inputStream().use { load(it) }
    }
    val releaseKeystoreFile = releaseKeystoreProps.getProperty("storeFile")?.let { file("../release.properties").resolveSibling(it) }
    signingConfigs {
        if (releaseKeystoreFile != null && releaseKeystoreFile.exists()) {
            create("nexonaiRelease") {
                storeFile = releaseKeystoreFile
                storePassword = releaseKeystoreProps.getProperty("storePassword")
                keyAlias = releaseKeystoreProps.getProperty("keyAlias")
                keyPassword = releaseKeystoreProps.getProperty("keyPassword")
            }
        }
        if (testKeystoreFile != null && testKeystoreFile.exists()) {
            create("nexonaiTest") {
                storeFile = testKeystoreFile
                storePassword = testKeystoreProps.getProperty("storePassword")
                keyAlias = testKeystoreProps.getProperty("keyAlias")
                keyPassword = testKeystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            signingConfigs.findByName("nexonaiTest")?.let { signingConfig = it }
        }
        release {
            signingConfigs.findByName("nexonaiRelease")?.let { signingConfig = it }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.10"
    }

    // Drei Editionen aus einer Codebasis. In Android Studio unter
    // "Build Variants" auswählbar (standardDebug / proDebug / clientDebug …).
    // Jede Edition hat eigene Install-ID → alle drei parallel installierbar.
    flavorDimensions += "edition"
    productFlavors {
        create("standard") {
            dimension = "edition"
            buildConfigField("String", "EDITION", "\"standard\"")
            resValue("string", "app_name", "unpruuf")
        }
        create("pro") {
            dimension = "edition"
            applicationIdSuffix = ".pro"
            versionNameSuffix = "-pro"
            buildConfigField("String", "EDITION", "\"pro\"")
            resValue("string", "app_name", "unpruuf Pro")
        }
        create("client") {
            dimension = "edition"
            applicationIdSuffix = ".client"
            versionNameSuffix = "-client"
            buildConfigField("String", "EDITION", "\"client\"")
            resValue("string", "app_name", "unpruuf Client")
        }
        // unpruuf Pro Groups: the Pro (Business) app plus local groups (a group message is sent as
        // one ordinary 1:1 message per member; see domain/group/ and EDITIONS.md). Own install id
        // so it sits next to Pro; pairs only with other Groups installs (AppEdition.canAdd).
        create("group") {
            dimension = "edition"
            applicationIdSuffix = ".group"
            versionNameSuffix = "-group"
            buildConfigField("String", "EDITION", "\"group\"")
            resValue("string", "app_name", "unpruuf Pro Groups")
        }
        // Compliance/whistleblower product line (separate from Standard/Pro/Client — see
        // CROSS_PLATFORM_PLAN.md "Two separate product lines" and AppEdition.kt). Deliberately
        // has NO app/src/whistleblower/res of its own and no dedicated accent color (Theme.kt
        // falls through to the Standard teal scheme) — an app that visibly announces itself as
        // "Whistleblower" on a reporter's home screen or launcher is itself a safety risk if
        // someone else glances at the phone. It inherits Standard's launcher icon/colors
        // unchanged; the only visible difference is in Settings → About (deliberately NOT
        // glanceable) and the pairing/relay behavior (see RelayManager.isMandatory()).
        create("whistleblower") {
            dimension = "edition"
            applicationIdSuffix = ".whistleblower"
            versionNameSuffix = "-whistleblower"
            buildConfigField("String", "EDITION", "\"whistleblower\"")
            resValue("string", "app_name", "unpruuf")
        }
        // safeline Press: the free reporting app for sources writing to a journalist (the
        // officer-app's press edition). Same behaviour as "whistleblower" (AppEdition.isWhistleblower
        // is true for both), its own wording in app/src/press/res (English, values-ro Romanian) and
        // its own install id, so it can sit next to the other editions. Neutral name on the phone.
        create("press") {
            dimension = "edition"
            applicationIdSuffix = ".press"
            versionNameSuffix = "-press"
            buildConfigField("String", "EDITION", "\"press\"")
            resValue("string", "app_name", "unpruuf")
        }
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Compose & UI
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.7.6")
    implementation("androidx.activity:activity-compose:1.8.2")
    // Fingerprint/biometric unlock, alongside PIN — see PinLockScreen.kt. BiometricPrompt
    // needs a FragmentActivity host (MainActivity was changed accordingly).
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-process:2.7.0")
    implementation("androidx.core:core-ktx:1.12.0")

    // Hilt Dependency Injection
    implementation("com.google.dagger:hilt-android:2.50")
    kapt("com.google.dagger:hilt-android-compiler:2.50")
    implementation("androidx.hilt:hilt-navigation-compose:1.1.0")

    // Room DB + SQLCipher (Verschlüsselung)
    implementation("androidx.room:room-runtime:2.6.1")
    implementation("androidx.room:room-ktx:2.6.1")
    kapt("androidx.room:room-compiler:2.6.1")
    implementation("net.zetetic:android-database-sqlcipher:4.5.4")
    implementation("androidx.sqlite:sqlite-ktx:2.4.0")

    // Tor (Guardian Project — bindet Tor-Binary + jtorctl transitiv)
    implementation("info.guardianproject:tor-android:0.4.8.16")
    implementation("androidx.localbroadcastmanager:localbroadcastmanager:1.1.0")

    // Pluggable transports (obfs4/Snowflake) for DPI-censored networks — see
    // PluggableTransportManager.kt. Correct group/artifact confirmed against the project's own
    // README (github.com/tladesignz/IPtProxy) — "org.torproject:iptproxy" (the first guess) was
    // wrong, this is the real Maven Central coordinate. Available since IPtProxy 1.9.0; bump the
    // version here if a newer one exists by the time this is built.
    implementation("com.netzarchitekten:IPtProxy:5.5.1")

    // Google Tink (XChaCha20-Poly1305)
    implementation("com.google.crypto.tink:tink-android:1.11.0")

    // QR Code (ZXing)
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")

    // JSON
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    // Debug
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    // Unit tests (pure JVM — no Android framework, no emulator required)
    testImplementation("junit:junit:4.13.2")
}

kapt {
    correctErrorTypes = true
}
