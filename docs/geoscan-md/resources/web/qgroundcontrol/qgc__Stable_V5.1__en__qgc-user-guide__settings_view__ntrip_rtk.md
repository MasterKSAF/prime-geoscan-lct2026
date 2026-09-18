---
title: "NTRIP / RTK | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/ntrip_rtk.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "a94e71438e29f9117d87e67ad5e2785c0f55e072cebc6d211d328251c0929f19"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [NTRIP / RTK | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/ntrip_rtk.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="ntrip-rtk"></a>

# NTRIP / RTK

Configure the built-in NTRIP client to stream RTCM correction data to the vehicle for centimeter-level RTK GPS positioning.

<a id="connection-status"></a>

## Connection Status

Shows the current NTRIP connection state (connected/connecting/disconnected) with message and byte counters, data rate, and a Connect/Disconnect button.

<a id="server"></a>

## Server

- **Host address** — NTRIP caster hostname or IP
- **Server port** — NTRIP caster port (default: 2101)
- **Username** — NTRIP account username
- **Password** — NTRIP account password (with show/hide toggle)
- **Use TLS encryption** — enable TLS for the NTRIP connection

<a id="mountpoint"></a>

## Mountpoint

- **Mount Point** — the NTRIP mountpoint to connect to
- **Browse** — fetch available mountpoints from the server and display them in a list with format, navigation system, country, bitrate, and distance information

<a id="options"></a>

## Options

- **RTCM Message Filter** — whitelist of RTCM message types to forward (empty = forward all)

<a id="udp-forwarding"></a>

## UDP Forwarding

- **UDP forward RTCM data** — forward received RTCM data to another device via UDP
- **UDP target address** — destination IP for forwarded data
- **UDP target port** — destination port for forwarded data

<a id="udp-rtcm-input"></a>

## UDP RTCM Input

- **Enable UDP RTCM input** — receive RTCM data from a UDP source instead of NTRIP
- **UDP RTCM input port** — port to listen on (default: 13320, range: 1024–65535)
