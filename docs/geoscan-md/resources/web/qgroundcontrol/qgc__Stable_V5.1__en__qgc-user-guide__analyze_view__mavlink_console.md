---
title: "MAVLink Console (Analyze View) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/mavlink_console.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "278f4412ea22736ca63ab66f79efe7e64d12cfd5ca283abc5b4869060f0ecb5d"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [MAVLink Console (Analyze View) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/mavlink_console.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="mavlink-console-analyze-view"></a>

# MAVLink Console (Analyze View)

The MAVLink Console (**Analyze \> Mavlink Console**) allows you to connect to the PX4 [System Console](https://docs.px4.io/main/en/debug/system_console.html) and send commands.

INFO

The console only works when connected to *hardware* running the *PX4* flight stack. PX4 SITL and ArduPilot are not supported.

TIP

This is a very useful feature for developers as it allows deep access to the system. In particular, if you are connected via Wifi, you can have this same level of access while the vehicle is flying.

The view does not display any output except in response to commands. Once the vehicle is connected, you can enter commands in the bar provided (for a full list of available commands enter: `?`).

Command output is displayed in the view above the command bar. Click **Show Latest** to jump to the bottom of the command output.
