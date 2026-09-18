---
title: "Understanding Altitude in ArduPilot — Plane  documentation"
source_url: "https://ardupilot.org/plane/docs/common-understanding-altitude.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "4c71889d62ff64ed696a2a825db07befe1cc2c4c882507bfaeec8979d8f299dc"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Understanding Altitude in ArduPilot — Plane  documentation](https://ardupilot.org/plane/docs/common-understanding-altitude.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="understanding-altitude-in-ardupilot"></a>

<a id="common-understanding-altitude"></a>

# Understanding Altitude in ArduPilot

ArduPilot documentation uses the word “altitude” often and in many different ways and contexts. Not all “altitudes” mean the same thing, and a good understanding of what altitude means in any given context is important to understand expected operation and behavior.

 [[../_images/altitudes.jpg](https://ardupilot.org/plane/_images/altitudes.jpg)](https://ardupilot.org/plane/_images/altitudes.jpg)

Note

ORIGIN and HOME are set during ground initialization from the GPS and are usually the same location, but the user may move the HOME location during the flight via Mission Planner (for a different RTL point), but the Origin always remains the same unless intentionally reset.

<a id="definitions-of-altitude-alt"></a>

## Definitions of Altitude (ALT)

In the above diagram, various types of “altitude” are shown:

- ASL: Altitude above (mean) Sea Level - the altitude of the vehicle expressed as distance above the mean sea level of the world.
- AGL: Altitude above Ground Level: the altitude of the vehicle above whatever is directly below it.
- Relative: Relative altitude above HOME/ORIGIN position’s altitude. This is what is displayed in the ground station and OSD as the vehicle’s altitude.
- Terrain ALT: The height above sea level (asl) of a terrain position. This sometimes, but not always includes, any natural or man-made additions to the terrain’s ground altitude.
- Estimated ALT: The autopilot’s estimation of vehicle Relative altitude above ORIGIN which is used internally by the vehicle’s Altitude Controller to maintain or obtain the Target ALT in altitude controlled modes (Plane: FBWB/AUTO/GUIDED/CRUISE/LOITER/CIRCLE), Copter: ALTHOLD/CIRCLE/LOITER/GUIDED/AUTO/DRIFT)
- Target ALT: The desired altitude in altitude controlled modes. Either from pilot input (eg ALTHOLD) or from navigation controller (eg AUTO)

<a id="estimated-and-target-alt"></a>

## Estimated and Target ALT

 [[../_images/altitude-control.jpg](https://ardupilot.org/plane/_images/altitude-control.jpg)](https://ardupilot.org/plane/_images/altitude-control.jpg)

The above simplified diagram shows how altitude control is implemented in ArduPilot.

The EKF subsystem is responsible for generating attitude, velocity, position, and altitude estimates for the vehicle so that the navigation and control systems can properly operate. EKF takes the IMU, GPS, and BARO sensor inputs and integrates them to provide these estimates, one of which is the Estimated ALT.

This is then fed to the vehicle’s altitude control system, which attempts to match the Target ALT in altitude controlled modes.

The Target ALT can come from many different sources depending on the vehicle mode. For example, In Plane’s FBWB mode, the pitch stick increases or decreases the Target ALT, while in AUTO mode when navigating to a waypoint, the navigation controller feeds a varying ramp of Target ALT as it progresses toward the waypoint to reach that waypoint’s new altitude, if different from the previous waypoint’s.

In the altitude controller, the Target ALT can also be modified by either Terrain Data from the GCS or SD card if [TERRAIN\_ENABLE](https://ardupilot.org/plane/docs/parameters.html#terrain-enable) is enabled, and/or RangeFinder altitude readings of distance above ground, if enabled and within the range of the rangefinder. Note that in both cases, the displayed altitude in the GCS HUD or OSD is the Estimated Altitude as long as EKF is working (otherwise it will use BARO altitude relative to HOME).

Note

Sometimes the GPS ASL altitude is displayed prior to setting of the Origin position in the EKF during ground initialization.

<a id="target-alt-modification-using-rangefinder-rf"></a>

## Target ALT Modification using RangeFinder (RF)

<a id="copter"></a>

### Copter

If a downward facing RangeFinder is enabled and within range, then the Target ALT will be modified to use the RF’s altitude measurements in Copter and in VTOL modes of Plane.

For example, you are in ALTHOLD in Copter, hovering at 30m and out of the RangeFinder’s range. The Target ALT has been set to the current Estimated ALT and will try to hold it. Now you descend using the throttle stick to 10m and are now within the RF’s range. When you release the stick, the Target ALT will be set to the RF reported altitude. The Estimated Altitude is still being used to adjust control outputs.

If the vehicle is moved over a ground object 1m tall. The Estimated ALT will remain unchanged, since it’s based on BARO, GPS ALT, etc. but the Target ALT will be increased by 1M due to the RF readings showing 1m less distance to the ground. Any changes in RF altitude are immediately reflected in the Target ALT, so if the less accurate Estimated ALT erroneously varies a little, the RF effectively immediately cancels that via Target ALT adjustment, yielding more accurate altitude control.

If the RF’s measurements change too rapidly (\>2m for 3 reports), or the RF moves out of range, then they will be ignored and current altitude from the Estimated ALT set as new Target ALT. This prevents rapid climbs/descents with fast moving RF data. It also means that tracking requiring large,rapid changes, such as quickly approaching a tall object, will result in a possible impact. See [Object Avoidance](https://ardupilot.org/plane/docs/common-object-avoidance-landing-page.html#common-object-avoidance-landing-page) in those cases.

This is called [Surface Tracking](https://ardupilot.org/copter/docs/terrain-following-manual-modes.html#terrain-following-manual-modes) in ArduPilot.

Optionally (normally recommended only for indoor use), the RF can be used as an additional sensor source for the EKF for altitude estimation. This is normally only used when the only altitude sensor available is a RF, since they have very limited range and more subject to environmental impacts to accuracy.

<a id="plane"></a>

### Plane

In Plane, when using fixed wing modes, RangeFinder use, when within range and enabled by the [RNGFND\_LANDING](https://ardupilot.org/plane/docs/parameters.html#rngfnd-landing) parameter, is limited to:

- Adjusting glide slope during [Automatic Landings](https://ardupilot.org/plane/docs/automatic-landing.html#automatic-landing), during the approach and pre-flare phases of the landing.
- Determining altitude when [LGR\_DEPLOY\_ALT](https://ardupilot.org/plane/docs/parameters.html#lgr-deploy-alt), or [LGR\_RETRACT\_ALT](https://ardupilot.org/plane/docs/parameters.html#lgr-retract-alt) is reached, if a downward facing RF is active and within range.
- When [Q\_LAND\_FINAL\_ALT](https://ardupilot.org/plane/docs/parameters.html#q-land-final-alt) is reached in VTOL landings in QuadPlane, if a downward facing RF is active.
- Determining if below [Q\_ASSIST\_ALT](https://ardupilot.org/plane/docs/parameters.html#q-assist-alt).
- Determining if below [Q\_VFWD\_ALT](https://ardupilot.org/plane/docs/parameters.html#q-vfwd-alt).

<a id="target-alt-modification-using-terrain-following-data"></a>

## Target ALT Modification using Terrain Following Data

If Terrain Following is enabled and active, then the terrain altitude changes are used to increase or decrease the Target ALT for whatever the present location is, as it moves, depending on vehicle and mode. For details see [Terrain Following](https://ardupilot.org/plane/docs/common-terrain-following.html#common-terrain-following) for Plane or [Terrain Following (in Auto, Guided, etc)](https://ardupilot.org/copter/docs/terrain-following.html#terrain-following) for Copter.

For Copter, this can be combined with RangeFinder use for obtain [Surface Tracking](https://ardupilot.org/copter/docs/terrain-following-manual-modes.html#terrain-following-manual-modes) over obstacles at low altitudes.
