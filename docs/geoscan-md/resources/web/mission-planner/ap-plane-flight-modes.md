---
title: "Flight Modes — Plane  documentation"
source_url: "https://ardupilot.org/plane/docs/flight-modes.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "7aea66c6b734790374b2e352eae5515b8cb5d3849957b578baded30eeef1be39"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Flight Modes — Plane  documentation](https://ardupilot.org/plane/docs/flight-modes.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="flight-modes"></a>

<a id="id1"></a>

# Flight Modes

This article provides links to Plane’s flight modes.

<a id="overview"></a>

## Overview

Plane has a wide range of built in flight modes. Plane can act as a simple flight stabilization system, a sophisticated autopilot, a training system or a flight safety system depending on what flight mode and options you choose.

Flight modes are controlled through a [radio transmitter switch](https://ardupilot.org/plane/docs/common-rc-transmitter-flight-mode-configuration.html#common-rc-transmitter-flight-mode-configuration), via mission commands, or using commands from a ground station (GCS) or companion computer.

<a id="major-flight-modes"></a>

## Major Flight Modes

All of the flight modes below have optional additional controls that may be used to change the behaviour to suit particular flying needs. After you have read the introductory material below it is highly recommended that you look through the complete set of [Plane parameters](https://ardupilot.org/plane/docs/parameters.html) so you can explore the full range of functionality available.

| Mode | Roll | Pitch | Throttle | GPS | Need TX | Summary |
| --- | --- | --- | --- | --- | --- | --- |
| MANUAL | - | - | - |  | Y | Manual control surface movement, passthrough |
| FBWA | s | s | - |  | Y | Roll and pitch follow stick input, up to set limits |
| FBWB | s | A | SPD | Y | Y | like FBWA, but with automatic height and speed control |
| CRUISE | A | A | SPD | Y | Y | like FBWB, but with ground course tracking |
| STABILIZE | + | + | - |  | Y | Wing-leveling on stick release |
| AUTOTUNE | s | s | - |  | Y | like FBWA, but learns attitude tuning while flying |
| TRAINING | + | + | - |  | Y | Manual control up to roll and pitch limits |
| ACRO | + | + | - |  | Y | rate controlled mode with no attitude limits |
| Q(Copter Modes) | s | s | A | Y | Y | Varies depending on mode. See quadplane documentation |
| AUTO | A | A | A | Y |  | Follows Mission |
| LOITER | A | A | A | Y |  | Circles point where mode switched |
| CIRCLE | A | A | A |  |  | Gently turns aircraft |
| GUIDED | A | A | A | Y |  | Circles user defined point from GCS |
| Return To Launch (RTL) | A | A | A | Y |  | Returns to and circles home or rally point |
| TAKEOFF | A | A | A | Y |  | Automatic takeoff to specific altitude, and loiter at distance from takeoff until mode is changed |
| THERMAL | A | A | A | Y |  | Mode entered to search for thermal lift by SOARING feature or manually if lift is encountered. See [THERMAL Mode](https://ardupilot.org/plane/docs/thermal-mode.html) |
| AUTOLAND | A | A | A | Y |  | Fixed wing Autoland See [AUTOLAND Mode](https://ardupilot.org/plane/docs/mode_autoland.html) |

| Symbol | Definition |
| --- | --- |
| - | Full manual control of flight surfaces |
| + | Manual control with stabilized limits or assistance |
| s | Stabilized control with limits |
| A | Automatic control |
| SPD | Controls speed |

Note

Automatic throttle controlled modes can optionally have pilot-based speed adjustments using the throttle stick via the [THROTTLE\_NUDGE](https://ardupilot.org/plane/docs/parameters.html#throttle-nudge) parameter. Otherwise, the autopilot will attempt to maintain [AIRSPEED\_CRUISE](https://ardupilot.org/plane/docs/parameters.html#airspeed-cruise) airspeed if an airspeed sensor is being used, or [TRIM\_THROTTLE](https://ardupilot.org/plane/docs/parameters.html#trim-throttle) as a target throttle, as in FBWA and CRUISE modes.

Note

Most altitude controlled modes can optionally maintain altitude with respect to Terrain instead of relative to HOME. See [Terrain Following](https://ardupilot.org/plane/docs/common-terrain-following.html#common-terrain-following) for more information.

Warning

Any stabilized control mode requires tuning for optimal performance. The default PID and TECS values are very conservative to avoid uncontrollable oscillations. Perform an [AUTOTUNE](https://ardupilot.org/plane/docs/automatic-tuning-with-autotune.html#automatic-tuning-with-autotune) before using stabilized or automatic roll and pitch modes extensively. [Tune TECS](https://ardupilot.org/plane/docs/tecs-total-energy-control-system-for-speed-height-tuning-guide.html#tecs-total-energy-control-system-for-speed-height-tuning-guide) before using automatic throttle modes extensively.

Note

AUTO mode also provides for [Automatic Takeoff](https://ardupilot.org/plane/docs/automatic-takeoff.html#automatic-takeoff) and [Automatic Landing](https://ardupilot.org/plane/docs/automatic-landing.html#automatic-landing).

<a id="flight-mode-list"></a>

## Flight Mode List

- [ACRO Mode](https://ardupilot.org/plane/docs/acro-mode.html)
- [AUTO Mode](https://ardupilot.org/plane/docs/auto-mode.html)
- [AUTOLAND](https://ardupilot.org/plane/docs/mode_autoland.html)
- [AUTOTUNE Mode](https://ardupilot.org/plane/docs/autotune-mode.html)
- [CRUISE Mode](https://ardupilot.org/plane/docs/cruise-mode.html)
- [CIRCLE Mode](https://ardupilot.org/plane/docs/circle-mode.html)
- [FBWA Mode (FLY BY WIRE\_A)](https://ardupilot.org/plane/docs/fbwa-mode.html)
- [FBWB Mode (FLY BY WIRE\_B)](https://ardupilot.org/plane/docs/fbwb-mode.html)
- [GUIDED Mode](https://ardupilot.org/plane/docs/guided-mode.html)
- [LOITER Mode](https://ardupilot.org/plane/docs/loiter-mode.html)
- [MANUAL Mode](https://ardupilot.org/plane/docs/manual-mode.html)
- [RTL Mode (Return To Launch)](https://ardupilot.org/plane/docs/rtl-mode.html)
- [STABILIZE Mode](https://ardupilot.org/plane/docs/stabilize-mode.html)
- [TAKEOFF Mode](https://ardupilot.org/plane/docs/takeoff-mode.html)
- [TRAINING Mode](https://ardupilot.org/plane/docs/training-mode.html)
- [THERMAL Mode](https://ardupilot.org/plane/docs/thermal-mode.html)
