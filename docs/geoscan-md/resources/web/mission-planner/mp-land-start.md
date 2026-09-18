---
title: "Using DO_LAND_START — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-do-land-start.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "664716d91fad10c78b7c915e3003bbcd8e02bc99092d6829e12d44eaaa66a4fe"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Using DO_LAND_START — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-do-land-start.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="using-do-land-start"></a>

<a id="common-do-land-start"></a>

# Using DO\_LAND\_START

The [DO\_LAND\_START](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#mav-cmd-do-land-start) mission item can be used for two purposes:

1. In Plane, to provide an automatic re-attempt for an aborted NAV\_LAND autolanding in a mission. (See [How to Abort an Autolanding](https://ardupilot.org/plane/docs/aborting-autolanding.html#aborting-autolanding))
2. To provide an automatic landing sequence for RTLs in Plane or as a failsafe action in Copter.

Note

in Rover, it can be used, but only via Scripting call to start the landing sequence.

You can optionally include more than one `DO_LAND_START` mission item in your mission. If that is done then the latitude/longitude/altitude of the `DO_LAND_START` mission items is used to choose which landing sequence to use. The `DO_LAND_START` closest to the current location in all three dimensions is used. This can be useful if you have multiple landing sequences for different wind conditions or different areas.

Note

If you are already in a landing sequence (NAV\_LAND or DO\_START\_LAND sequence), then it will continue.
