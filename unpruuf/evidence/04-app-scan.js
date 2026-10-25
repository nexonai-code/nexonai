#!/usr/bin/env node
'use strict';
// What can the Android app do towards the outside? A scan of the manifest, the libraries and the
// source (not of a running app). Findings name file and line so that a reviewer can look.
const fs = require('fs');
const path = require('path');
const { Run, walk, stripComments, ROOT } = require('./lib');

const run = new Run('04', 'What the Android app can do towards the outside (manifest, libraries, source)');
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const manifestPath = path.join(ROOT, 'app/src/main/AndroidManifest.xml');
const manifest = fs.readFileSync(manifestPath, 'utf8');

// 1. Permissions.
const perms = [...manifest.matchAll(/uses-permission\s+android:name="([^"]+)"/g)].map((m) => m[1].replace('android.permission.', '')).sort();
const ALLOWED = ['ACCESS_NETWORK_STATE', 'CAMERA', 'CHANGE_WIFI_MULTICAST_STATE', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_DATA_SYNC', 'INTERNET', 'POST_NOTIFICATIONS', 'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'WAKE_LOCK'];
run.check('the app asks for exactly these permissions: ' + ALLOWED.join(', '), JSON.stringify(perms) === JSON.stringify(ALLOWED), perms.join(', '));
const SENSITIVE = ['READ_CONTACTS', 'WRITE_CONTACTS', 'ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'READ_PHONE_STATE', 'READ_PHONE_NUMBERS', 'READ_SMS', 'SEND_SMS', 'RECORD_AUDIO', 'GET_ACCOUNTS', 'READ_EXTERNAL_STORAGE', 'READ_CALL_LOG', 'READ_CALENDAR', 'BODY_SENSORS'];
run.check('no permission for contacts, location, phone, SMS, microphone, accounts, calendar or storage', !perms.some((p) => SENSITIVE.includes(p)));
run.check('backup is switched off (allowBackup=false, fullBackupContent=false)', /allowBackup="false"/.test(manifest) && /fullBackupContent="false"/.test(manifest));
run.check('clear-text traffic is switched off (usesCleartextTraffic=false)', /usesCleartextTraffic="false"/.test(manifest));
const exported = [...manifest.matchAll(/<(activity|service|receiver|provider)[^>]*android:exported="true"[^>]*>/g)];
run.check('only one component is reachable from other apps, and it is the launcher activity', exported.length === 1 && /MainActivity/.test(exported[0][0]), exported.map((m) => m[0].slice(0, 80)).join(' | '));

// 2. Libraries: nothing that reports, tracks or pushes.
const gradleFiles = [path.join(ROOT, 'app/build.gradle.kts'), path.join(ROOT, 'relay-android/app/build.gradle.kts'), path.join(ROOT, 'build.gradle.kts')].filter(fs.existsSync);
const DENY = /firebase|play-services|com\.google\.android\.gms|crashlytics|sentry|appcenter|bugsnag|facebook|adjust|mixpanel|amplitude|appsflyer|onesignal|datadog|newrelic|admob|segment|branch\.io|flurry|leakcanary-android(?!.*debug)/i;
const denyHits = [];
for (const f of gradleFiles) fs.readFileSync(f, 'utf8').split('\n').forEach((t, i) => { if (/^\s*(implementation|api|kapt|ksp)\b/.test(t) && DENY.test(t)) denyHits.push(`${rel(f)}:${i + 1} ${t.trim()}`); });
run.check('no analytics, crash-reporting, advertising, push or Google Play services library is a dependency', denyHits.length === 0, denyHits.join(' | '));
const deps = [];
for (const f of gradleFiles) fs.readFileSync(f, 'utf8').split('\n').forEach((t) => { const m = t.match(/^\s*implementation\("([^"]+)"/); if (m && !/androidx|compose|kotlinx|dagger|hilt/.test(m[1])) deps.push(m[1]); });
run.note('non-Android-platform libraries (an auditor should review each): ' + [...new Set(deps)].sort().join(', '));

// 3. Source: how the app reaches the network.
const srcs = walk(path.join(ROOT, 'app/src/main/java'), /\.kt$/);
const code = srcs.map((f) => ({ f: rel(f), lines: stripComments(fs.readFileSync(f, 'utf8')).split('\n') }));
const find = (re) => code.flatMap(({ f, lines }) => lines.map((t, i) => ({ f, n: i + 1, t: t.trim() })).filter((x) => re.test(x.t)));

const highLevel = find(/\bHttpURLConnection\b|\bjava\.net\.URL\(|\bURL\(|\bOkHttp|\bHttpClient\b|\bWebView\b|\bRetrofit\b|\bDownloadManager\b/);
run.check('the app uses no ready-made HTTP client, WebView or download manager', highLevel.length === 0, highLevel.map((x) => `${x.f}:${x.n}`).join(', '));
const imports = find(/import\s+(android\.telephony|android\.location|android\.provider\.ContactsContract|android\.accounts|com\.google\.android\.gms|com\.google\.firebase|android\.provider\.CallLog|android\.provider\.Telephony)/);
run.check('no source file imports telephony, location, contacts, accounts, call log, Google services or Firebase', imports.length === 0, imports.map((x) => `${x.f}:${x.n}`).join(', '));

const sockets = find(/(^|[^A-Za-z.])Socket\(/).filter((x) => !/ServerSocket/.test(x.t));
// Two ways through Tor: Java's own Proxy object (Socket(proxy)), and the app's SOCKS5 client
// (Socks5.kt), which opens a plain socket to the local Tor proxy and asks it for the onion service.
const torPath = (x) => /Socket\(proxy\)/.test(x.t) || /Socks5\.kt$/.test(x.f);
const viaTor = sockets.filter(torPath);
const direct = sockets.filter((x) => !torPath(x));
run.check('every client socket the app opens goes through the Tor SOCKS proxy, except one', viaTor.length >= 3 && direct.length === 1, `through Tor: ${viaTor.map((x) => x.f.split('/').pop() + ':' + x.n).join(', ')}; direct: ${direct.map((x) => x.f.split('/').pop() + ':' + x.n).join(', ')}`);
if (direct.length) run.note(`the one direct socket (${direct[0].f}:${direct[0].n}) is the same-Wi-Fi shortcut for direct (onion) contacts. It is never used for Business or Node-Mesh contacts, and not at all in the whistleblower edition (see SECURITY_CLAIMS.md, 2026-10-01).`);
const socksCalls = find(/\bSocks5\.connect\(/);
const socks5 = code.find((c) => /Socks5\.kt$/.test(c.f));
const socksConnects = socks5 ? socks5.lines.filter((t) => /\.connect\(/.test(t)) : [];
run.check('the app\'s own SOCKS5 client connects only to the local Tor proxy (127.0.0.1), and every caller passes that address',
  socksCalls.length >= 1 && socksCalls.every((x) => /Socks5\.connect\(\s*"127\.0\.0\.1"/.test(x.t)) && socksConnects.length === 1 && /InetSocketAddress\(proxyHost, proxyPort\)/.test(socksConnects[0]),
  `callers: ${socksCalls.map((x) => x.f.split('/').pop() + ':' + x.n).join(', ')}; connect calls in Socks5.kt: ${socksConnects.length}`);
const serverSockets = find(/ServerSocket\(/);
const loopbackSockets = serverSockets.filter((x) => /127\.0\.0\.1/.test(x.t));
const openSockets = serverSockets.filter((x) => !/127\.0\.0\.1/.test(x.t));
run.check('all listening sockets are bound to 127.0.0.1, except one random-port socket for the same-Wi-Fi shortcut', loopbackSockets.length >= 2 && openSockets.length === 1, `loopback: ${loopbackSockets.map((x) => x.f.split('/').pop() + ':' + x.n).join(', ')}; open: ${openSockets.map((x) => x.f.split('/').pop() + ':' + x.n).join(', ')}`);
const p2p = code.find((c) => /P2PNetworkManager\.kt$/.test(c.f));
const p2pText = p2p.lines.join('\n');
const calls = (p2pText.match(/\bopenLanServer\(\)/g) || []).length;
const guard = /fun lanDiscoveryNeeded\(\)[\s\S]{0,400}isWhistleblower\) return false[\s\S]{0,400}!it\.nodeMesh && !it\.crossPlatform/.test(p2pText);
const guardedCall = /updateLanDiscovery\(\)\s*\{\s*if \(!lanDiscoveryNeeded\(\)\)[\s\S]{0,200}return[\s\S]{0,600}openLanServer\(\)/.test(p2pText);
run.check('that open socket exists only while a direct contact exists: never in the whistleblower edition, never for Business (Node-Mesh) contacts', calls === 2 && guard && guardedCall, `definition + ${calls - 1} call; guard found: ${guard}; call behind the guard: ${guardedCall}`);

// 4. Device identifiers.
const aid = find(/ANDROID_ID/).filter((x) => !/^\/\/|^\*/.test(x.t));
run.check('the Android device id is read in exactly one place (the local licence check), and nowhere else', aid.length === 1 && /LicenseManager/.test(aid[0].f), aid.map((x) => `${x.f}:${x.n}`).join(', '));
const aidUse = code.find((c) => /LicenseManager/.test(c.f));
const hashedOnly = aidUse && /SHA-256/.test(aidUse.lines.join('\n')) && !/putExtra|send|post|deposit|push/i.test(aidUse.lines.slice(150, 175).join('\n'));
run.check('that value is hashed and kept on the phone (the licence check has no network call)', !!hashedOnly && !find(/nodeMeshClient|relayClient|Socket\(/).some((x) => /LicenseManager/.test(x.f)));

// 5. Web addresses written in the source.
const urls = new Set();
code.forEach(({ lines }) => lines.forEach((t) => { for (const m of t.matchAll(/https?:\/\/[A-Za-z0-9._-]+/g)) urls.add(m[0]); }));
const okUrl = (u) => /signal\.org$/.test(u) || /rsc\.cdn77\.org$/.test(u);
run.check('web addresses in the source: only the Snowflake broker front and a documentation link', [...urls].every(okUrl), [...urls].join(', '));
run.note('Only if the user is on a network that blocks Tor does the app fall back to bridges. The Snowflake path then contacts a broker through a CDN front and STUN servers (see ConnectionPaths.kt). That is Tor\'s own circumvention, but it IS contact with third-party infrastructure, so "the app talks only to Tor" holds for the direct path and must be worded carefully for the fallback path.');

// 6. Screen protection.
const secure = find(/FLAG_SECURE/).filter((x) => !/^\/\/|^\*/.test(x.t));
run.check('screenshots and the app-switcher preview are blocked (FLAG_SECURE is set)', secure.length >= 1, secure.map((x) => `${x.f}:${x.n}`).join(', '));

const res = run.finish(process.argv[2]);
process.exit(res.failed ? 1 : 0);
