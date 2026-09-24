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
        versionCode = 15
        versionName = "1.14"

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

    buildTypes {
        release {
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
