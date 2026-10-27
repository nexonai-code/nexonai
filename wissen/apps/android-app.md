---
type: app
id: android-app
title: unpruuf Android app
status: tested
updated: '2026-10-27'
summary: Main messenger client (Kotlin, Jetpack Compose), package com.nexonai.unpruuf, editions as Gradle flavors.
products:
- unpruuf-business
- unpruuf-compliance
- unpruuf-press
code:
- unpruuf/app
build: Android Studio, open unpruuf/
---
- Flavors: standard, pro, client, group, whistleblower, press (each with own install ID).
- Version 1.14 per STATUS.md; Tor hidden services, Double Ratchet, fixed 4096-byte packets, RAM-only messages.
- Build: open unpruuf/ in Android Studio, Build Variants; AGP 8.2.2, Kotlin 1.9.22, compileSdk 34.
- Development environment has no Android SDK: code was reasoned and structurally checked, real builds happen outside it (Android Studio).
