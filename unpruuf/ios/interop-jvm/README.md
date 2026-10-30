# interop-jvm

Proves that iOS and Android build the same packets. It compiles the Android app's own files
(`DoubleRatchet.kt`, `RatchetHeader.kt`, `RatchetFrame.kt`, `NetworkObfuscation.kt`) unchanged,
so no Android SDK is needed, only JDK 17. `CryptoManager` and `RatchetSessionManager` need Android
classes, so `Interop.kt` repeats their few lines for the outer encryption and the root key.

The fixtures are in `UnpruufCore/Tests/UnpruufCoreTests/Fixtures`. From this folder:

```bash
F=$PWD/../UnpruufCore/Tests/UnpruufCoreTests/Fixtures
../../gradlew -p . --no-daemon -q run --args="generate $F/android-packets.txt"
(cd ../UnpruufCore && INTEROP_WRITE=$F/swift-packets.txt swift test)
../../gradlew -p . --no-daemon -q run --args="check $F/swift-packets.txt"
```

`swift test` opens `android-packets.txt`. `check` fails if Android cannot open what Swift built.
Regenerate both after any change to the packet format. Each file holds the first sender's messages
only; a reply after the first ratchet step is covered by the unit tests on each side, not here.
