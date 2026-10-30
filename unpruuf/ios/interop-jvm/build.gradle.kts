// Runs the Android app's own packet code (unchanged source files, no Android SDK needed) against
// fixtures shared with UnpruufCore. See README.md here.
plugins {
    kotlin("jvm") version "1.9.22"
    application
}

kotlin { jvmToolchain(17) }

sourceSets {
    main {
        kotlin {
            srcDir("src")
            srcDir("../../app/src/main/java")
            include(
                "interop/**",
                "com/nexonai/unpruuf/domain/network/ratchet/DoubleRatchet.kt",
                "com/nexonai/unpruuf/domain/network/ratchet/RatchetHeader.kt",
                "com/nexonai/unpruuf/domain/network/RatchetFrame.kt",
                "com/nexonai/unpruuf/domain/network/NetworkObfuscation.kt",
            )
        }
    }
}

dependencies { implementation("com.google.crypto.tink:tink:1.11.0") }

application { mainClass.set("interop.InteropKt") }
