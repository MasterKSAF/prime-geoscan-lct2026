---
title: "GeoFencing — Plane  documentation"
source_url: "https://ardupilot.org/plane/docs/common-geofencing-landing-page.html"
retrieved_at: "2026-09-15T18:41:16.759136+00:00"
source_sha256: "06d093602f3aed4d024900f237c88eb77c02da439f9e2c57068dec6b9152fd96"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [GeoFencing — Plane  documentation](https://ardupilot.org/plane/docs/common-geofencing-landing-page.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="geofencing"></a>

<a id="common-geofencing-landing-page"></a>

# GeoFencing

ArduPilot supports a home based Cylindrical (“TinCan”) and Polygonal and/or Cylindrical, Inclusion and/or Exclusion regions. Inclusion and Exclusion Fences are defined easily in Mission Planner under the PLAN screen and loaded to the autopilot, using the FENCES item in the drop down box, just like Missions or Rally Points are planned.

Some vehicles can also have maximum and/or minimum altitude limits. Some flight modes will try to prevent exceeding these limits automatically, a fence breach will be declared in all modes if exceeded.

Upon Fence breach, selectable actions are taken.

<a id="general-setup"></a>

## General Setup

- Set [FENCE\_ENABLE](https://ardupilot.org/plane/docs/parameters.html#fence-enable) = 1 to enable fences. This enables any fences that are setup, except the ALT\_MIN fence, which must be enabled by using any fence enable means (GCS message, AUTOENABLE in plane, RC switch)
- Set [FENCE\_ACTION](https://ardupilot.org/plane/docs/parameters.html#fence-action) = to whatever you wish for a breach action. These will vary depending on vehicle type. See [Fence Breach Actions](https://ardupilot.org/plane/docs/common-geofencing-landing-page.html#fence-breach-actions) above.
- Set [FENCE\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#fence-options) Set bit 1 to prevent mode changes after a fence breach until the vehicle returns within the fence boundary (Plane only, Copter/Rover do not allow mode changes while in breach). Set bit 2 to use the Union of inclusion areas instead of just Intersects. Set bit 3 to provide GCS warning when vehicle is less than [FENCE\_MARGIN](https://ardupilot.org/plane/docs/parameters.html#fence-margin) from a breach. This parameter is also used in avoidance and path planning.
- Set [FENCE\_ALT\_MAX](https://ardupilot.org/plane/docs/parameters.html#fence-alt-max) = to the altitude limit you want (in meters). This is unavailable in Rover.
- Set [FENCE\_MARGIN](https://ardupilot.org/plane/docs/parameters.html#fence-margin) = to the distance from the fence horizontal boundary the vehicle must maintain in order to prevent a breach.
- Set the [FENCE\_ALT\_MIN](https://ardupilot.org/plane/docs/parameters.html#fence-alt-min) as a minimum altitude breach boundary. This is unavailable in Rover.
- Set [FENCE\_ALT\_MAX\_TP](https://ardupilot.org/plane/docs/parameters.html#fence-alt-max-tp) and [FENCE\_ALT\_MIN\_TP](https://ardupilot.org/plane/docs/parameters.html#fence-alt-min-tp) to select the altitude reference frame used by the maximum and minimum altitude fences, respectively. See [Altitude Fence Reference Frames](https://ardupilot.org/plane/docs/common-geofencing-landing-page.html#altitude-fence-frames) below. These are unavailable in Rover.
- Set [FENCE\_AUTOENABLE](https://ardupilot.org/plane/docs/parameters.html#fence-autoenable) = (Plane Only)to allow automatic enabling of the fence (different than [FENCE\_ENABLE](https://ardupilot.org/plane/docs/parameters.html#fence-enable)) under certain vehicle conditions, such as upon arming or takeoff. A value of 0 disables this feature. [FENCE\_ENABLE](https://ardupilot.org/plane/docs/parameters.html#fence-enable) is ignored if this feature is enabled. Using [FENCE\_AUTOENABLE](https://ardupilot.org/plane/docs/parameters.html#fence-autoenable) = 3 (enable on ARM) is the only recommended use. “1” or “2” functions are being deprecated shortly since they can produce undesirable results in terms of containment.
- [FENCE\_RET\_RALLY](https://ardupilot.org/plane/docs/parameters.html#fence-ret-rally) allows returning to the nearest RALLY point (See: [Rally Points](https://ardupilot.org/plane/docs/common-rally-points.html#common-rally-points)), if loaded, instead of HOME.
- Set [FENCE\_TYPE](https://ardupilot.org/plane/docs/parameters.html#fence-type) = is a bitmap set to enable the various fence types: MIN or MAX altitude, simple CIRCLE tin can around HOME, or POLYGON fences. The POLYGON fences must also have been loaded via a fence list from a ground control station in order to be active. See below for detailed setup of [Cylindrical Fence](https://ardupilot.org/plane/docs/common-ac2_simple_geofence.html#common-ac2-simple-geofence) and [Inclusion and Exclusion Fences](https://ardupilot.org/plane/docs/common-polygon_fence.html#common-polygon-fence).

Note

Polygon fence type includes the circular fences specified in the Inclusion/Exclusion fence list. The simple home centered CIRCLE fence is a separate fence. Rover ignores altitudes, if set.

Defaults for [FENCE\_TYPE](https://ardupilot.org/plane/docs/parameters.html#fence-type) are:

- Rover: CIRCLE and POLYGON
- Copter: ALT MAX, CIRCLE, and POLYGON
- Plane: POLYGON

<a id="detailed-setup"></a>

### Detailed Setup

- [Cylindrical Fence Failsafe](https://ardupilot.org/plane/docs/common-ac2_simple_geofence.html)
- [Inclusion/Exclusion Fence Failsafe](https://ardupilot.org/plane/docs/common-polygon_fence.html)

<a id="types-of-fences"></a>

## Types of Fences

| TYPE OF FENCE | `FENCE_TYPE` bit | PLANE | COPTER | ROVER |
| --- | --- | --- | --- | --- |
| **Global Maximum Altitude**<br><br><br><br>- FENCE\_ALT\_MAX defines max altitude | 0 | X | X |  |
| **Cylindrical (“TinCan”)**<br><br><br><br>- Circle Centered on Home<br>- Parameters for radius, height | 1 | X | X | X |
| **Inclusion/Exclusion Zones**<br><br><br><br>- Arbitrary Locations<br>- Polygonal or Circular<br>- Inclusion or Exclusion<br>- Defined by list, like missions<br>- No height/altitude restriction | 2 | X | X | X |
| **Global Minimum Altitude**<br><br><br><br>- FENCE\_ALT\_MIN defines min altitude | 3 | X |  |  |

Note

if [FENCE\_TYPE](https://ardupilot.org/plane/docs/parameters.html#fence-type) =2 inclusion zones overlap, a fence breach will occur when crossing a boundary, even if within another inclusion zone, UNLESS [FENCE\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#fence-options) bit 1 is set to make all inclusions zones a union set.

<a id="altitude-fence-reference-frames"></a>

<a id="altitude-fence-frames"></a>

## Altitude Fence Reference Frames

The maximum and minimum altitude fences ([FENCE\_ALT\_MAX](https://ardupilot.org/plane/docs/parameters.html#fence-alt-max) and [FENCE\_ALT\_MIN](https://ardupilot.org/plane/docs/parameters.html#fence-alt-min)) are altitudes above home by default. The altitude reference frame for each can be selected with [FENCE\_ALT\_MAX\_TP](https://ardupilot.org/plane/docs/parameters.html#fence-alt-max-tp) and [FENCE\_ALT\_MIN\_TP](https://ardupilot.org/plane/docs/parameters.html#fence-alt-min-tp), respectively:

- 0: above mean sea level (AMSL)
- 1: above home (the default, and the behaviour of previous releases)
- 2: above the EKF origin
- 3: above terrain

These parameters are unavailable in Rover. The altitude fences are global limits, independent of any Inclusion/Exclusion fence boundaries, which are horizontal-only.

Note

Using the above terrain frame (3) requires a terrain database (see [Terrain Following](https://ardupilot.org/plane/docs/common-terrain-following.html#common-terrain-following)) and will prevent arming until terrain data is available. If the vehicle cannot determine its altitude in the selected frame while flying, the corresponding fence is treated as breached.

<a id="fence-breach-actions"></a>

<a id="id1"></a>

## Fence Breach Actions

If enabled, and the fence boundaries or altitudes([FENCE\_ALT\_MAX](https://ardupilot.org/plane/docs/parameters.html#fence-alt-max) and [FENCE\_ALT\_MIN](https://ardupilot.org/plane/docs/parameters.html#fence-alt-min)), if non-zero, are exceeded, Plane will execute the [FENCE\_ACTION](https://ardupilot.org/plane/docs/parameters.html#fence-action) below:

<table class="docutils align-default">
<thead>
<tr class="row-odd"><th class="head" rowspan="2"><p>FENCE_ACTION</p></th>
<th class="head" rowspan="2"><p>Plane</p></th>
</tr>
<tr class="row-even"></tr>
</thead>
<tbody>
<tr class="row-odd"><td rowspan="2"><p>0</p></td>
<td rowspan="2"><p>Report Only</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"><td rowspan="2"><p>1</p></td>
<td rowspan="2"><p>RTL</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"><td rowspan="3"><p>6</p></td>
<td rowspan="3"><p>Guided to return
point</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"></tr>
<tr class="row-even"><td rowspan="4"><p>7</p></td>
<td rowspan="4"><p>Guided to return
point with pilot
throttle control</p></td>
</tr>
<tr class="row-odd"></tr>
<tr class="row-even"></tr>
<tr class="row-odd"></tr>
<tr class="row-even"><td rowspan="3"><p>8</p></td>
<td rowspan="3"><p>AUTOLAND mode, or
RTL</p></td>
</tr>
<tr class="row-odd"></tr>
<tr class="row-even"></tr>
</tbody>
</table>

The return (and loiter) point, unless [FENCE\_RET\_RALLY](https://ardupilot.org/plane/docs/parameters.html#fence-ret-rally) is enabled, is the geometric center of the breached fence boundary. If [FENCE\_ACTION](https://ardupilot.org/plane/docs/parameters.html#fence-action) is set to a guided return mode (6 or 7), the altitude at which it returns is determined by [FENCE\_RET\_ALT](https://ardupilot.org/plane/docs/parameters.html#fence-ret-alt) or if [FENCE\_RET\_ALT](https://ardupilot.org/plane/docs/parameters.html#fence-ret-alt) is zero, midway between the altitude limits, if non-zero. If both altitude limits are zero, then it will return at current altitude.

The return point can also be replaced by the nearest rally point (See: [Rally Points](https://ardupilot.org/plane/docs/common-rally-points.html#common-rally-points)) as a destination, if [FENCE\_RET\_RALLY](https://ardupilot.org/plane/docs/parameters.html#fence-ret-rally) is enabled.

Note

while executing any action that requires a mode change (ie. all except Report Only), any additional fence breaches are recorded but ignored. For example, RTL that has an AutoLand will breach a MIN\_ALT fence, if enabled, but take no action and finish the landing.

Modes changes cannot be executed after the fence breach unless the [FENCE\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#fence-options) bit 0 is set to “0”. By default it is set to “1” to prevent mode changes. When set, the vehicle must return to within the fence boundary in order to change modes. If mode changes are allowed, you can also return to the mode that was active upon breach by using an RC auxiliary switch set to option “96” (Re-read mode switch).

<a id="enabling-the-fence-with-an-rc-channel-auxiliary-switch"></a>

## Enabling the Fence with an RC Channel Auxiliary Switch

It is not necessary to set-up a switch to enable or disable the fence but if you wish to control the fence with a switch follow these steps:

An `RCx_OPTION` can be set via the Config/Tuning \> Full Parameter List screen, for example using RC channel 7:

- Set [RC7\_OPTION](https://ardupilot.org/plane/docs/parameters.html#rc7-option) = 11 (Fence Enable)
- setting the switch high (i.e. PWM \> 1800) will enable all configured fences, low (under 1800) will disable all fences.

Note

if the Minimum Altitude fence is enabled by the switch while on the ground and disarmed, a pre-arm failure will occur preventing arming.

<a id="automatic-altitude-breach-avoidance"></a>

## Automatic Altitude Breach Avoidance

For landing modes (NAV\_LAND,QLAND,LAND,etc.) in Copter and Plane, the [FENCE\_ALT\_MIN](https://ardupilot.org/plane/docs/parameters.html#fence-alt-min) limit is automatically disabled.

When in Mode FBWB or CRUISE, Plane will attempt to limit altitude target changes by the pilot (ie using Pitch stick for climb/descent rate demand inputs) to avoid breaching a maximum or minimum altitude fence.

Note

altitude control imperfections can still result in a breach unless the [FENCE\_MARGIN](https://ardupilot.org/plane/docs/parameters.html#fence-margin) param is loose enough to accommodate these imperfections.

<a id="enabling-fences-in-mission-planner"></a>

## Enabling Fences in Mission Planner

To enable Fences, go to the Mission Planner full parameter list (CONFIG-\>Full Parameter Tree), search for items with `FENCE_`:

 [[../_images/fence_enable.png](https://ardupilot.org/plane/_images/fence_enable.png)](https://ardupilot.org/plane/_images/fence_enable.png)

<a id="use-for-r-c-training"></a>

## Use for R/C Training

One of the main uses of geo-fencing is to teach yourself (or someone else) to fly radio controlled vehicles. When you have a properly configured geo-fence it is very hard to crash, and you can try manoeuvres that would normally be too likely to end in a crash, trusting the autopilot to ‘bounce’ the vehicle off the geo-fence before the flight ends in disaster.

Geo-fencing can be combined with any flight mode. So for a raw beginner, you would combine it with one of the stabilised flight modes . Once the pilot has gained some confidence you could combine it with ACRO mode in Copter or MANUAL mode in Plane, which gives direct control of the vehicle and allows for the most interesting aerobatic manoeuvres.

<a id="stick-mixing-on-fence-breach"></a>

## Stick-mixing on fence breach

ArduPilot enables ‘stick mixing’ by default when in auto modes. This means that you can change the path of a loiter, for example, by using your transmitter sticks.

When you are using geo-fencing, stick mixing will be disabled on fence breach until your plane is back inside the fenced region. This is to ensure that the bad control inputs that caused you to breach the fence don’t prevent it from recovering to the return point.

As soon as you are back inside the fence stick mixing will be re-enabled, allowing you to control the GUIDED mode that the plane will be in. If by using stick mixing you manage to take the plane outside the fence again then stick mixing will again be disabled until you are back inside the fence.

<a id="mavlink-support"></a>

## MAVLink support

ArduPilot will report the fence status via the MAVLink GCS protocol. The key status packet is called FENCE\_STATUS, and is defined in “ardupilotmega.xml”. A typical FENCE\_STATUS packet looks like this:

```text
2011-12-20 16:36:35.60: FENCE_STATUS breach_status : 1, breach_count : 15, breach_type : 1, breach_time : 1706506
```

The breach\_status field is 0 if inside the fence, and 1 if outside. The breach\_count is how many fence breaches you have had on this flight. The breach\_type is the type of the last breach (see the FENCE\_BREACH enum in ardupilotmega.xml). The breach\_time is the time in milliseconds of the breach since APM was booted.

The MAV\_SYS\_STATUS\_GEOFENCE bit of the MAV\_SYS\_STATUS\_SENSOR portion of the SYS\_STATUS message indicates whether or not the geo-fence is breached. As of this writing only the MAVProxy GCS recognizes this status bit and reports the status of the geo-fence. In the future the Mission Planner, APM Planner, and other GCS applications should get support for announcing geo-fence status during the flight.

The MAV\_CMD\_DO\_FENCE\_ENABLE MAVLink command message allows a GCS to enable or disable a fence interactively. As of this writing only MAVProxy supports this message using the “fence enable” or “fence disable” commands. In the future Mission Planner, APM Planner, and other GCS applications may get support for interactively enabling and disabling the geo-fence without needing to use a manual transmitter.
