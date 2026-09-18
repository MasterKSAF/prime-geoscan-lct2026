---
title: "Remote Support (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/remote_support.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "fd406ad163a7cb7be2b605476c81d4a89496ef273829585348de1672853760fc"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Remote Support (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/remote_support.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="remote-support-ardupilot"></a>

# Remote Support (ArduPilot)

The Remote Support page allows you to forward MAVLink telemetry to a remote support server, enabling another person to view your vehicle's status in real time.

- **Host name** — the hostname or IP address of the support server
- **Connect** — establish the MAVLink forwarding link

Once connected, all MAVLink traffic is forwarded to the specified host. The forwarding continues until QGroundControl is restarted.
