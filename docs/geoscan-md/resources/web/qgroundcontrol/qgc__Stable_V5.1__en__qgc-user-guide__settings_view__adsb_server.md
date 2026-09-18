---
title: "ADSB Server | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/adsb_server.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "d57658bbdeea07202db8e926de22004b10ecfb62bbc818417fafbf852976fd0e"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [ADSB Server | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/adsb_server.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="adsb-server"></a>

# ADSB Server

Configure a connection to an ADS-B SBS-format server to display nearby aircraft traffic on the Fly View map.

- **Connect to ADSB SBS server** — enable or disable the connection (default: off)
- **Host address** — IP address or hostname of the ADS-B server (default: `127.0.0.1`)
- **Server port** — TCP port of the ADS-B server (default: `30003`)

When enabled, QGC connects to the specified server and displays received ADS-B aircraft positions as traffic icons on the map.
