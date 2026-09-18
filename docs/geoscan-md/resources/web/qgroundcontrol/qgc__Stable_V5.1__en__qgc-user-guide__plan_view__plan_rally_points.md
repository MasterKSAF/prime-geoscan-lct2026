---
title: "Plan View - Rally Points | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_rally_points.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "21aa648aed74f3a38008c9d46ae867fd707094ec3eaac7a882e5ce7a49132dbc"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Plan View - Rally Points | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_rally_points.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="plan-view-rally-points"></a>

# Plan View - Rally Points

Rally Points are alternative landing or loiter locations. They are typically used to provide a safer or more convenient (e.g. closer) destination than the home position in Return/RTL mode.

INFO

*QGroundControl* will not display the Rally Point options if they are not supported by the connected vehicle firmware.

<a id="rally-point-usage"></a>

## Rally Point Usage

To create Rally Points:

1. Navigate to the Plan View
2. Select the **Rally Points** layer using the [Layer Switcher](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html#layer_switcher) in the top-right area of the map (or expand the **Rally Points** section in the [Plan Editor Panel](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html#plan_editor_panel))
3. Click the map wherever you want rally points.

   - An **R** marker is added for each
   - The currently active marker has a different color (green) and its editor is expanded in the *Rally Points* section.
4. Make any rally point active by selecting it on the map or in the *Rally Points* section:

   - Move the active rally point by either dragging it on the map or editing the position fields in its editor.
   - Delete a rally point by pressing the **X** delete button on its editor.

<a id="upload-rally-points"></a>

## Upload Rally Points

Rally points are uploaded along with the rest of the plan using the **Upload** button in the [Plan Toolbar](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html#file).
