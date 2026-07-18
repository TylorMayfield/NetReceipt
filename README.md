# NetReceipt — Internet Connection Monitor for macOS, Windows, and Linux

NetReceipt is a free, private internet connection monitor and network reliability tracker for macOS, Windows, and Linux. It continuously checks TCP latency, DNS resolution, and HTTPS connectivity so you can spot slow internet, outages, and intermittent connection problems from a compact desktop dashboard.

Built with Tauri, Rust, TypeScript, React, and Radix UI. Connection tests and history stay on your computer.

## Download NetReceipt

Download the latest NetReceipt desktop app for your platform:

| Platform | Latest build |
| --- | --- |
| macOS — Apple Silicon | [Download DMG](https://github.com/TylorMayfield/NetReceipt/releases/latest/download/NetReceipt-mac-arm64.dmg) |
| macOS — Intel | [Download DMG](https://github.com/TylorMayfield/NetReceipt/releases/latest/download/NetReceipt-mac-x64.dmg) |
| Windows — 64-bit installer | [Download EXE](https://github.com/TylorMayfield/NetReceipt/releases/latest/download/NetReceipt-windows-x64.exe) |
| Windows — portable 64-bit | [Download ZIP](https://github.com/TylorMayfield/NetReceipt/releases/latest/download/NetReceipt-windows-x64.zip) |
| Linux — 64-bit | [Download AppImage](https://github.com/TylorMayfield/NetReceipt/releases/latest/download/NetReceipt-linux-x86_64.AppImage) |
| Ubuntu, Debian, and Mint — 64-bit | [Download DEB](https://github.com/TylorMayfield/NetReceipt/releases/latest/download/NetReceipt-linux-amd64.deb) |

[View all releases and release notes](https://github.com/TylorMayfield/NetReceipt/releases)

## Features

- Monitor TCP latency, DNS lookup time, and HTTPS response time.
- Detect healthy, slow, interrupted, and partially available connections.
- Review a rolling 30-minute latency graph plus 6-hour, 24-hour, 7-day, and 30-day history views.
- See confirmed incident counts, durations, severity, and peak latency without counting monitoring gaps as downtime.
- Tune the check interval, timeout, slow-connection threshold, alert tolerance, and retention period.
- Receive status notifications after sustained connection changes.
- Export a readable Markdown connection report or raw CSV measurements for troubleshooting and ISP support.
- Pause and resume monitoring from the desktop app.
- Run on macOS, Windows, and Linux.

NetReceipt does not upload monitored hosts, connection measurements, or exported history. Optional GA4 product telemetry is off until you explicitly enable it.

## Development

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform, including Rust, then run:

```bash
npm install
npm run tauri dev
```

## Build and test

```bash
npm run check
npm run build:tauri
```

Pushing a `v*` tag runs signed desktop builds for Apple Silicon macOS, Intel macOS, Windows, and Linux, then publishes consistently named artifacts to the GitHub release. The product page is deployed from `docs/` through GitHub Pages.

## Support

- [Support NetReceipt on Ko-fi](https://ko-fi.com/tylormayfield)
- [More projects by Tylor Mayfield](https://www.tylor.nz)

## Privacy and legal

NetReceipt stores monitoring configuration and connection history locally. Optional Google Analytics 4 telemetry records only coarse app-open and feature-use events after consent.

- [Privacy Policy and Terms of Service](https://www.tylor.nz/legal)
- [Source code and issues](https://github.com/TylorMayfield/NetReceipt)

## License

Copyright © 2026 BarkOnTrack LLC. Add the project license file before distributing builds; the release page and product site intentionally do not claim a license until one is present.
