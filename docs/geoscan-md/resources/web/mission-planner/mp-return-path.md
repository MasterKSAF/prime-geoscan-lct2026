---
title: "Using DO_RETURN_PATH_START Mission Command — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-do-return-path-start.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "a9a812b1548ceb74aef78e459fa000f254f447b92ec9c9288e6e526c77080869"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Using DO_RETURN_PATH_START Mission Command — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-do-return-path-start.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="using-do-return-path-start-mission-command"></a>

<a id="common-do-return-path-start"></a>

# Using DO\_RETURN\_PATH\_START Mission Command

While the [DO\_LAND\_START](https://ardupilot.org/planner/docs/common-do-land-start.html#common-do-land-start) mission command provides a means of defining a “landing sequence” that can be directly jumped to for autolandings or failsafe actions, in some cases this direct path might result in breaching fences or flying into obstacles.

The DO\_RETURN\_PATH\_START mission command can be used to mark a place or places in the mission sequence, before the [DO\_LAND\_START](https://ardupilot.org/planner/docs/common-do-land-start.html#common-do-land-start), that the vehicle should directly rejoin the mission path at the closet point on the mission leading toward the [DO\_LAND\_START](https://ardupilot.org/planner/docs/common-do-land-start.html#common-do-land-start) sequence, rather than directly to the [DO\_LAND\_START](https://ardupilot.org/planner/docs/common-do-land-start.html#common-do-land-start). As shown below:

 [[../_images/do-return-path-start.jpg](https://ardupilot.org/planner/_images/do-return-path-start.jpg)](https://ardupilot.org/planner/_images/do-return-path-start.jpg)

Imagine above that the vehicle takes off, flies to WP2 and 3, and if one were to fly up and look at the lake but then have a failsafe, the vehicle would fly directly back to the DO\_LAND\_START tag, crashing thru the tree, exclusion fence, etc. But if a DO\_RETURN\_PATH\_START mission item is inserted after WP 3, then the vehicle would return to the mission path, proceed to the waypoint after the DO\_LAND\_START tag and LAND safely.

Multiple DO\_RETURN\_PATH\_START items can be placed in the mission sequence to tailor the return. It is not necessary that the sequence include a [DO\_LAND\_START](https://ardupilot.org/planner/docs/common-do-land-start.html#common-do-land-start), but if it does, the return to the mission will occur after the DO\_RETURN\_PATH\_START mission command but before the [DO\_LAND\_START](https://ardupilot.org/planner/docs/common-do-land-start.html#common-do-land-start).
