---
title: "Plan View Settings | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/plan_view.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "e0cd50e736add73185011670b641a73059de10ddec0323a4f5270878b3c4bd42"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Plan View Settings | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/plan_view.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="plan-view-settings"></a>

# Plan View Settings

Settings that control defaults and behavior in the [Plan View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html).

- **Default mission item altitude** — altitude assigned to new waypoints when added to a mission
- **VTOL Transition Distance** — distance before a waypoint at which a VTOL vehicle begins its transition from forward flight to multirotor mode (default: 300 m, minimum: 100 m)
- **Use MAV\_CMD\_CONDITION\_GATE for pattern generation** — use gate waypoints instead of regular waypoints when generating survey and corridor scan patterns
- **Missions do not require takeoff item** — allow missions without an explicit takeoff command
- **Allow configuring multiple landing sequences** — enable adding more than one landing pattern to a mission (default: enabled)
