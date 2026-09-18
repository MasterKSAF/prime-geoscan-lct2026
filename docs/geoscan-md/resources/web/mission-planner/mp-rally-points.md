---
title: "Rally Points — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-rally-points.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "0e61de261881917c03f692b964fcb6592a04bb5486f9c8d00b0c586c744bd2ac"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Rally Points — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-rally-points.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="rally-points"></a>

<a id="common-rally-points"></a>

# Rally Points

<a id="overview"></a>

## Overview

Ordinarily when a plane or copter enters [Return to Launch (RTL)](https://ardupilot.org/rover/docs/rtl-mode.html#rtl-mode) mode (typically triggered by an autopilot [failsafe](https://ardupilot.org/plane/docs/apms-failsafe-function.html#apms-failsafe-function)), the default behaviour is to return to the [Home point](https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html#common-planning-a-mission-with-waypoints-and-events-setting-the-home-position), but there are often cases when that can be undesirable. For example it may be an area full of people or property and a system running in RTL mode may very likely be in a state that merits extreme caution! It is also possible that the flight plan is large enough that should the aircraft enter RTL mode it is undesirable to traverse all the way back to the point of takeoff.

For this reason we now support the creation of multiple Rally Points. Should an aircraft enter RTL and Rally Points have been defined then it will proceed to the closest Rally Point, rather than proceeding to the Home position. Plane will then loiter at that location, and Copter will perform an automated landing there.

<a id="id1"></a>

 [[../_images/mp_flight_plan_with_three_rally_points.jpg](https://ardupilot.org/planner/_images/mp_flight_plan_with_three_rally_points.jpg)](https://ardupilot.org/planner/_images/mp_flight_plan_with_three_rally_points.jpg)

A flight plan with Rally Points. Rally Points are denoted with Purpleplace markers. Mousing over a Rally Point will give its loiter altitude(as in the middle point above).

<a id="setting-up-rally-points"></a>

## Setting Up Rally Points

The following steps are for specifying Rally Points in Mission Planner:

1. Rally Point latitude and longitude.To set a Rally Point’s location, right click on the Flight Plan map, and select Rally Points \> Set Rally Point on the resulting pop-up menu (note that this ONLY work in the Flight Plan screen, not the Flight Data screen):

    [[../_images/mp_rally_point_dialog.jpg](https://ardupilot.org/planner/_images/mp_rally_point_dialog.jpg)](https://ardupilot.org/planner/_images/mp_rally_point_dialog.jpg)
2. The Rally loiter altitudes need to be specified (note that the default altitude for Rally Points is the default waypoint altitude value and is relative to the home location):

    [[../_images/mp_rally_altitude_dialog.jpg](https://ardupilot.org/planner/_images/mp_rally_altitude_dialog.jpg)](https://ardupilot.org/planner/_images/mp_rally_altitude_dialog.jpg)  [[../_images/defaultAltCircled1.png](https://ardupilot.org/planner/_images/defaultAltCircled1.png)](https://ardupilot.org/planner/_images/defaultAltCircled1.png)
3. Repeat for all desired Rally points!
4. Upload to the vehicle by selecting Rally Points \> Upload from the right-click popup menu

The following should be considered when using Rally Points:

1. If using a [geofence](https://ardupilot.org/plane/docs/geofencing.html#geofencing): its HIGHLY recommended the Rally Points you intend to use at your event are inside the geofence.
2. Make sure Rally Point altitudes are high enough to clear terrain and buildings.
3. Because of the limited flash memory size on the APM2.x hardware the number of Rally Points is restricted to 10 on Plane and 6 on Copter – this limit may be expanded on other platforms such as Pixhawk in the future.
4. On Plane, loiter radius for a Rally Point is the same as all other loiter points; determined by the [WP\_LOITER\_RAD](https://ardupilot.org/plane/docs/parameters.html#wp-loiter-rad) parameter.
5. The [RTL\_ALTITUDE](https://ardupilot.org/plane/docs/parameters.html#rtl-altitude) or [RTL\_ALT\_M](https://ardupilot.org/copter/docs/parameters.html#rtl-alt-m) parameters are NOT used with Rally Points! The aircraft will transit to the Rally Point at the altitude specified when adding that point.

The following MAVLink parameters control Rally Point behavior:

1. [RALLY\_LIMIT\_KM](https://ardupilot.org/sub/docs/parameters.html#rally-limit-km) is the maximum distance a Rally Point may be from the aircraft to be considered for an RTL event. If all Rally Points are greater than this distance from the aircraft, then the Home location is used for RTL events (at altitude [RTL\_ALTITUDE](https://ardupilot.org/plane/docs/parameters.html#rtl-altitude)) This parameter is to prevent fly offs if Rally Points have been specified for multiple flying fields. This parameter can be disabled if set to 0.
2. [RALLY\_INCL\_HOME](https://ardupilot.org/sub/docs/parameters.html#rally-incl-home) allows Home to be included in the RALLY points, allowing it to return to home if closer than any RALLY point.
3. [RALLY\_TOTAL](https://ardupilot.org/sub/docs/parameters.html#rally-total) is the number of Rally Points currently specified. This parameter will be set for you by your ground control station (e.g., Mission Planner) when you add and remove Rally Points. **IT IS HIGHLY UNLIKELY YOU WANT TO SET THIS PARAMETER MANUALLY AND IT IS PROBABLY UNSAFE TO DO SO**. RALLY\_TOTAL should be 0 if you have specified no Rally Points and in this case the Home location will be used for RTL events.

<a id="example-flight"></a>

## Example Flight

<a id="id2"></a>

 [[../_images/mp_rally_demo.jpg](https://ardupilot.org/planner/_images/mp_rally_demo.jpg)](https://ardupilot.org/planner/_images/mp_rally_demo.jpg)

Flight in which RTL was commanded nearwaypoint. Plane began loitering about the southernmost RallyPoint.

    [[../_images/mp_rally_point_dialog.jpg](https://ardupilot.org/planner/_images/mp_rally_point_dialog.jpg)](https://ardupilot.org/planner/_images/mp_rally_point_dialog.jpg)

<a id="appendix"></a>

## Appendix

The RALLY fields present in a rally point file are as follows:

- Lat: Latitude of Rally Point
- Lon: Longitude of Rally Point
- Alt: AGL altitude of Rally Point.
- Altitude Reference Frame: for ALT value: Relative to Home, above Terrain, or Absolute ASL.
