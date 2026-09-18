---
title: "Comm Links | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/comm_links.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "bc2f0c1061822bef671157b718971932dff4500357266978e16625e519b4cb28"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Comm Links | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/comm_links.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="comm-links"></a>

# Comm Links

Configure how QGroundControl connects to vehicles.

<a id="auto-connect"></a>

## Auto-Connect

By default, QGC auto-detects and connects to common devices:

- **Pixhawk** — auto-connect Pixhawk flight controllers via USB
- **SiK Radio** — auto-connect SiK telemetry radios
- **LibrePilot** — auto-connect LibrePilot controllers
- **UDP** — auto-connect via UDP broadcast
- **RTK GPS** — auto-connect RTK GPS base stations

<a id="nmea-gps"></a>

## NMEA GPS

Configure an external NMEA GPS device to provide GCS position (used for RTK and Remote ID):

- **Device** — Disabled, UDP, or Serial port
- **Baudrate** — serial baud rate (with custom baud option)
- **UDP port** — port for UDP NMEA input (default: 14401)

<a id="link-management"></a>

## Link Management

Manually create and manage communication links when auto-connect is insufficient:

- **Add New Link** — create a link with a name, type, and connection-specific settings:

  - **Serial** — port, baud rate, flow control
  - **TCP** — host address, port
  - **UDP** — local port, remote hosts
  - **Bluetooth** — device selection
- **Auto Connect on Start** — automatically connect this link when QGC starts
- **High Latency** — mark the link as high-latency (reduces message rate)

Existing links can be edited, deleted, connected, or disconnected from the link list.
