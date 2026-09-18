---
title: "Planning a Mission with Waypoints and Events — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html"
retrieved_at: "2026-09-15T18:09:54.449192+00:00"
source_sha256: "45ecb634b531f11ac37db6f4308417a4287060607c6f4af4002b2545ddc99f88"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Planning a Mission with Waypoints and Events — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="planning-a-mission-with-waypoints-and-events"></a>

<a id="common-planning-a-mission-with-waypoints-and-events"></a>

# Planning a Mission with Waypoints and Events

This page describes generic waypoint setup for all types of vehicles.

<a id="setting-the-home-position"></a>

<a id="common-planning-a-mission-with-waypoints-and-events-setting-the-home-position"></a>

## Setting the Home Position

For **Copter**, **Plane** and **Rover** the home position is set as the location where the vehicle was armed. This means if you execute an RTL, it will return to the location where it was armed, so arm your vehicle in the location you want it to return to, or use a rally point to setup an alternative return point.

<a id="video-produce-and-save-a-multi-waypoint-mission"></a>

## Video: Produce and save a Multi-waypoint Mission

<a id="video-load-an-already-saved-multi-waypoint-mission"></a>

## Video: Load an already saved Multi-waypoint Mission

<a id="instructions"></a>

## Instructions

In the screenshot below, a Copter mission starts with an auto takeoff to 20 meters altitude; then goes to WP 2 rising to 100 meters altitude on the way, then waits 10 seconds; then the craft will proceed to WP 3 (descending to 50 meters altitude on the way), then returns to launch. After reaching the launch position, the craft will land. The mission assumes that the launch position is set at the home position.

<a id="id1"></a>

 [[../_images/mp_mission_planning.jpg](https://ardupilot.org/planner/_images/mp_mission_planning.jpg)](https://ardupilot.org/planner/_images/mp_mission_planning.jpg)

Copter: Mission Planning Example

You can enter waypoints and other commands (see the [Mission commands](https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html#common-planning-a-mission-with-waypoints-and-events-mission-commands) section below for more information). In the dropdown menus on each row, select the command you want. The column heading will change to show you what data that command requires. Lat and Lon can be entered by clicking on the map. Altitude is relative to your launch altitude/home position, so if you set 100m, for example, it will fly 100m above you.

**Default Alt** is the default altitude when entering new waypoints. See [Understanding Altitude in ArduPilot](https://ardupilot.org/plane/docs/common-understanding-altitude.html#common-understanding-altitude) for altitude definitions.

**Verify height** means that the Mission Planner will use Google Earth topology data to adjust your desired altitude at each waypoint to reflect the height of the ground beneath. So if your waypoint is on a hill, if this option is selected the *Mission Planner* will increase your ALT setting by the height of the hill. This is a good way to make sure you don’t crash into mountains!

Once you are done with your mission, select **Write** and it will be sent to APM and saved in EEPROM. You can confirm that it’s as you wanted by selecting **Read**.

You can save multiple mission files to your local hard drive by selecting **Save WP File** or read in files with **Load WP File** in the right-click menu:

 [[../_images/mp_save_waypoints.jpg](https://ardupilot.org/planner/_images/mp_save_waypoints.jpg)](https://ardupilot.org/planner/_images/mp_save_waypoints.jpg)

<a id="tips"></a>

## Tips

- Prefetch: You can cache map data so you don’t need Internet access at the field. Click the **Prefetch** button, and hold down **Alt** to draw a box to download the selected imagery of a location.
- Grid: This allows you to draw a polygon (right click) and automatically create waypoints over the selected area. Note that it does not do “island detection”, which means if you have a big polygon and a little one inside of that, the little one will not be excluded from the big one (see [this](http://wiki.openstreetmap.org/wiki/Relation:multipolygon) for more). Also, in the case of any polygon that partially doubles backs on itself (like the letter U), the open area in the center will be included as part of the flyover.
- Setting your home location to the current location is easy, just click **Home Location** above where you enter your home location, and it will set your home location to the current coordinates.
- You can measure the distance between waypoints by right-clicking at one end and selecting Measure Distance. Then right-click on the other end and select **Measure Distance** again. A dialog box will open with the distance between the two points.
- The altitude change between waypoints is normally a linear ramp of target altitude as the vehicle progresses unless the altitude starts below 25m above home to prevent slow climbs potentially close to home. This value can be controlled with the [CLIMB\_SLOPE\_HGT](https://ardupilot.org/plane/docs/parameters.html#climb-slope-hgt) parameter.

<a id="auto-grid"></a>

## Auto grid

You can also have the *Mission Planner* create a mission for you, which is useful for function like mapping missions, where the aircraft should just go back and forth in a “lawnmower” pattern over an area to collect photographs.

To do this, in the right-click menu select Polygon and draw a box around the area you want to map. Then select Auto WP, Grid. Follow the dialog box process to select altitude and spacing. The *Mission Planner* will then generate a mission that looks something like this:

<a id="id2"></a>

 [[../_images/mp_auto_mission_grid.jpg](https://ardupilot.org/planner/_images/mp_auto_mission_grid.jpg)](https://ardupilot.org/planner/_images/mp_auto_mission_grid.jpg)

Mission Planner auto-generated grid

<a id="mission-commands"></a>

<a id="common-planning-a-mission-with-waypoints-and-events-mission-commands"></a>

## Mission commands

*Mission Planner* provides a filtered list of the commands appropriate for the current vehicle type, and adds column headings for the parameters that need user-supplied values. These include navigation commands to travel to waypoints and loiter in the vicinity, DO commands to execute specific actions (for example taking pictures), and condition commands that can control when DO commands are able to run.

<a id="id3"></a>

 [[../_images/MissionList_LoiterTurns.png](https://ardupilot.org/planner/_images/MissionList_LoiterTurns.png)](https://ardupilot.org/planner/_images/MissionList_LoiterTurns.png)

Example: LOITER\_TURNS command withheadings for number of turns, direction, and location to loiteraround.

The full set of mission commands supported by all ArduPilot platforms are listed in [MAVLink Mission Command Messages (MAV\_CMD)](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#common-mavlink-mission-command-messages-mav-cmd). This includes the full name of each command (as defined in the protocol definition), information about which parameters are supported, and also the corresponding *Mission Planner* column headings.

Note

Mission Planner uses a cut-down version of the full command name. For example, commands like MAV\_CMD\_NAV\_WAYPOINT, MAV\_CMD\_CONDITION\_DISTANCE, MAV\_CMD\_DO\_SET\_SERVO are listed in MP as WAYPOINT, CONDITION\_DISTANCE and DO\_SET\_SERVO respectively.

<a id="end-of-mission"></a>

## End of Mission

When the mission list is completed, Copter will loiter at the last waypoint indefinitely until a mode change or disarm (as when landing), Rover will hold, but Plane will RTL unless the last mission item is unlimited loiter or turns, or a landing.

<a id="mission-reset"></a>

## Mission Reset

On Copter and Rover, the mission is reset to the beginning of the mission list every disarm. On Plane, it is reset similarly, except in AUTO mode which does not reset on disarm and leaves the “mission pointer” on the last mission item to be performed. For all vehicles, any landing mission item, when the landing is completed, will not advance to the next mission item. The [MIS\_OPTIONS](https://ardupilot.org/sub/docs/parameters.html#mis-options) parameter, bit 2, can be set to continue onward in the mission list after landing.

One can set an `RCx_OPTION` switch function (“24”) to reset the mission item pointer to the beginning of the mission list at any time.

Also, the mission can be set to reset upon any entry into AUTO mode with the [MIS\_RESTART](https://ardupilot.org/sub/docs/parameters.html#mis-restart) parameter. Default (0) is to resume the mission when re-entering AUTO mode.

<a id="mis-options"></a>

## [MIS\_OPTIONS](https://ardupilot.org/sub/docs/parameters.html#mis-options)

The [MIS\_OPTIONS](https://ardupilot.org/sub/docs/parameters.html#mis-options) parameter bits can be set to modify how missions function:

| [MIS\_OPTIONS](https://ardupilot.org/sub/docs/parameters.html#mis-options) bit | Option |
| --- | --- |
| 0 | Clears the loaded mission on boot. Must be loaded after each boot. |
| 1 (Plane only) | Use distance to land calculation on battery failsafe. See [Using DO\_LAND\_START](https://ardupilot.org/planner/docs/common-do-land-start.html#common-do-land-start) |
| 2 | Continue after landing. Advances mission item pointer to next mission item after landing complete. If no item exists, RTL. |

<a id="mission-re-wind"></a>

## Mission Re-Wind

The behavior of returning to a mission sequence when interrupted by a mode change is described in the [Mission Rewind on Resume](https://ardupilot.org/planner/docs/common-mission-rewind.html#common-mission-rewind) section.

<a id="mission-size"></a>

## Mission Size

The number of mission items which can be stored in the autopilot is limited to approximately 650 waypoints. If you need to have longer missions, then you can set the [BRD\_SD\_MISSION](https://ardupilot.org/sub/docs/parameters.html#brd-sd-mission) parameter to create a file on the SD Card to store more. This can be set up to a maximum of 64 (kB) which would allow a total of over 4,000 waypoints in a mission.

<a id="how-to-prefetch-a-stored-mission-map"></a>

## How to prefetch a stored Mission Map

<a id="occasionally-you-will-see-some-really-big-numbers"></a>

## Occasionally You will see some really big Numbers
