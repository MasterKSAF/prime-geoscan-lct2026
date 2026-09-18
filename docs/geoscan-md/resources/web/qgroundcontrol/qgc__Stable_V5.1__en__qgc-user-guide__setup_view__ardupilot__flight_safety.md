---
title: "Flight Safety (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/flight_safety.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "600348e786cf04af62385607f3bb7218dc65c31c2eebba3b263f9eb4302543e8"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Flight Safety (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/flight_safety.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="flight-safety-ardupilot"></a>

# Flight Safety (ArduPilot)

The Flight Safety page configures Return to Launch behavior, geofence settings, and arming checks.

<a id="return-to-launch"></a>

## Return to Launch

Settings vary by vehicle type:

- **RTL altitude** — choose between returning at current altitude or a specified altitude (`RTL_ALT`)
- **Loiter above home** — optionally loiter at the return point before landing, with configurable loiter time (`RTL_LOIT_TIME`)
- **Final landing altitude** — altitude for the final descent phase (`RTL_ALT_FINAL`)
- **Landing speed** — descent rate during final landing (`LAND_SPD`)
- **RTL radius** — loiter radius at the return point (Plane, `RTL_RADIUS`; 0 uses the default waypoint loiter radius)
- **Auto-land** — automatically land after returning (Plane, `RTL_AUTOLAND`)

<a id="geofence"></a>

## GeoFence

- **Enable fence** — turn the geofence on or off (`FENCE_ENABLE`)
- **Fence type** — bitmask selecting which limits to enforce: max altitude, min altitude, circle radius, polygon boundaries (`FENCE_TYPE`)
- **Max altitude** / **Min altitude** — altitude limits in meters
- **Circle radius** — cylindrical fence radius around home (`FENCE_RADIUS`)
- **Fence margin** — buffer distance before the fence boundary triggers an action (`FENCE_MARGIN`)
- **Fence action** — what to do when the fence is breached (RTL / Land / Report Only / etc.)
- **Auto-enable** — automatically enable the fence on arming or mode change (`FENCE_AUTOENABLE`)
- **Return altitude** (Plane) — altitude for the fence return path (`FENCE_RET_ALT`)
- **Return to nearest rally point** (Plane) — use the closest rally point instead of home (`FENCE_RET_RALLY`)

<a id="arming-checks"></a>

## Arming Checks

WARNING

Disabling arming checks can be dangerous. Only disable checks if you understand the safety implications.

- **Arming checks** — bitmask of pre-arm checks to enforce (`ARMING_CHECK`). The first option enables/disables all checks.
- **Skip checks** — alternative bitmask to skip specific checks (`ARMING_SKIPCHK`)
