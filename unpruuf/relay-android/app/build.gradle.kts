plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.nexonai.unpruuf.relay"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.nexonai.unpruuf.relay"
        // Same floor as the main unpruuf app — adaptive icons (API 26+) let this project ship
        // without legacy PNG mipmap buckets, and it needs nothing older anyway.
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        vectorDrawables {
            useSupportLibrary = true
        }
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

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Compose & UI — versions pinned identical to the main unpruuf app for consistency.
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.core:core-ktx:1.12.0")

    // Tor (Guardian Project) — the exact same hidden-service mechanism the main unpruuf app
    // already uses (TorService + jtorctl's TorControlConnection), reused here for a single
    // fixed hidden service instead of a per-contact one.
    implementation("info.guardianproject:tor-android:0.4.8.16")
    implementation("androidx.localbroadcastmanager:localbroadcastmanager:1.1.0")

    // Pluggable transports (obfs4/Snowflake) for DPI-censored networks — same dependency and
    // same IPtProxy API surface as the main messenger app's PluggableTransportManager.kt.
    implementation("com.netzarchitekten:IPtProxy:5.5.1")

    // QR generation only (no camera scanning needed in this app) — core ZXing is enough.
    implementation("com.google.zxing:core:3.5.3")

    // Small, pure-Java embedded HTTP server — serves the relay's two JSON endpoints locally,
    // reached only through the Tor hidden service above (127.0.0.1-bound, never on the LAN).
    // Chosen over hand-rolling HTTP/1.1 parsing (unlike RelayClient.kt's hand-rolled CLIENT,
    // which only has to speak one fixed request shape it constructs itself, a SERVER has to
    // correctly parse arbitrary incoming requests — worth a small, extremely well-established
    // dependency instead of an unverifiable-here hand-rolled parser).
    implementation("org.nanohttpd:nanohttpd:2.3.1")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
