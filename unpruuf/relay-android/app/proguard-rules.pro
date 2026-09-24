# Same Guardian Project keep rules as the main unpruuf app's proguard-rules.pro.
-dontwarn info.guardianproject.**
-keep class info.guardianproject.** { *; }

# IPtProxy's gomobile-generated bindings (obfs4/Snowflake) — not under info.guardianproject.**
# (its package is literally "IPtProxy"), so it needs its own keep rule for a minified build.
-dontwarn IPtProxy.**
-keep class IPtProxy.** { *; }

# NanoHTTPD uses reflection-adjacent patterns for MIME/response handling internally in some
# versions; keeping the whole package is cheap insurance for a dependency this small.
-keep class fi.iki.elonen.** { *; }
