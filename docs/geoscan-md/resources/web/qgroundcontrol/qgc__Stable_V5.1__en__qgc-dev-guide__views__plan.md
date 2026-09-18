---
title: "Plan View | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/plan.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "a81c1f8574d8c29b639685a469cfd22d230eda70f249819f45edfbc598108745"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Plan View | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/plan.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="plan-view"></a>

# Plan View

- Top level QML code is in [PlanView.qml](https://github.com/mavlink/qgroundcontrol/blob/master/src/PlanView/PlanView.qml)
- Main visual UI is a FlightMap control
- The right panel is a unified plan tree: [PlanTreeView.qml](https://github.com/mavlink/qgroundcontrol/blob/master/src/PlanView/PlanTreeView.qml)
- QML communicates with MissionController (C++) which provides the view with the mission item data and methods
