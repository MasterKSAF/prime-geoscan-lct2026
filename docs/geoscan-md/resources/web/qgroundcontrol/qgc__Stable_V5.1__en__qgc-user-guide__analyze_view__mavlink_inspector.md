---
title: "MAVLink Inspector | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/mavlink_inspector.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "6220cd2a293da09669faec85f0b9be75a0e45b1d5a9b04ab1f61465e079c03aa"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [MAVLink Inspector | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/mavlink_inspector.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="mavlink-inspector"></a>

# MAVLink Inspector

The *MAVLink Inspector* provides real-time information and charting of MAVLink traffic received by *QGroundControl*.

WARNING

This feature is intended primarily for **autopilot developers**/**vehicle creators**. It is only supported on desktop builds (Windows, Linux, Mac OS).

The inspector lists all received messages for the current vehicle, along with their source component id and update frequency. You can drill down into individual messages to get the message id, source component id, and the values of all the individual fields. You can also chart field values in real time, selecting multiple fields from multiple messages to display on one of two charts.

To use the *MAVLink Inspector*:

1. Open *Analyze View* by selecting the *QGroundControl* application menu ("Q" icon in top left corner) and then choosing the **Analyze Tools** button (from the *Select Tool* popup).
2. Select the **MAVLink Inspector** from the sidebar.

   The view will start populating with messages as they are received.
3. Select a message to see its fields and their (dynamically updating) value:
4. Add fields to charts by enabling the adjacent checkboxes (plot 1 is displayed below plot 2).

   - Fields can be added to only one chart.
   - A chart can have multiple fields, and fields from multiple messages (these are listed above each chart). Messages containing fields that are being charted are highlighted with an asterisk.
   - The *Scale* and *Range* are set to sensible values, but can be modified if needed.
