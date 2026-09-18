---
title: "Fly View | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/fly.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "35d1bdeb3872697f4a41cccf6f8796933f38d5a31ea35cf160a09bfc406cccf7"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Fly View | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/fly.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="fly-view"></a>

# Fly View

- Top level QML code is in **FlightDisplayView.qml**
- QML code communicates with `MissionController` (C++) for mission display
- Instrument widgets communicate with active Vehicle object
- Two main inner views are:

  - `FlightDisplayViewMap`
  - `FlightDisplayViewVideo`
