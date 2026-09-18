---
title: "Mission Planner Configuration and Tuning — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/mission-planner-configuration-and-tuning.html"
retrieved_at: "2026-09-15T18:09:54.449192+00:00"
source_sha256: "4d5c4fdb97699ac73bb3c88206fc71e40c34562dd91eb4a2b0692d2f08642fc5"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Mission Planner Configuration and Tuning — Mission Planner  documentation](https://ardupilot.org/planner/docs/mission-planner-configuration-and-tuning.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="mission-planner-configuration-and-tuning"></a>

<a id="id1"></a>

# Mission Planner Configuration and Tuning

This section of Mission Planner, invoked by the Menu item `CONFIG` at the top of Mission Planner, has several subsections. The subsection are where you configure the parameters that control how your autopilot controls your vehicle.

Tuning refers to adjusting parameters in the control loops so your vehicle behaves the way you desire. Most of these parameters are set for you when you first install your firmware but some must be set before your first flight or roaming adventure.

What you see when you enter this section depends on whether or not you are connected and which vehicle is connected. Each menu item will bring up a new screen, each is discussed below with links to more detail.

<a id="planner"></a>

## Planner

You will see this menu item if the autopilot is or is not connected. when disconnected, this will be the only active item.

This is where you set up most of the options related to Mission Planner appearance and operation. Such things as enabling speech, where the logs are saved, the units of measure you want to use, etc.

<a id="flight-modes"></a>

## Flight Modes

This is where you can set the 6 flight modes controlled by the flight mode channel. This channel defaults to RC channel 8 for Plane, and channel 5 for Copter and Rover, but can be re-assigned by the [FLTMODE\_CH](https://ardupilot.org/sub/docs/parameters.html#fltmode-ch) parameter for Plane and Copter, and the [MODE\_CH](https://ardupilot.org/rover/docs/parameters.html#mode-ch) for Rover.

[../_images/MP-fltmode.png](https://ardupilot.org/planner/_images/MP-fltmode.png)

<a id="geofence-copter-only"></a>

## GeoFence (Copter only)

This allows configuration of the various Fence/Exclusion Zone/Inclusion Zone parameters. The coordinates of these fences are setup and saved via the PLAN screen. For Plane and Rover, these associated fence parameter must be set manually via the Full Parameter Screen described below.

For more information on Geo-Fences, see [geofencing](https://ardupilot.org/plane/docs/geofencing.html#geofencing), or [Cylindrical Fence](https://ardupilot.org/sub/docs/common-ac2_simple_geofence.html#common-ac2-simple-geofence) and/or [Inclusion and Exclusion Fences](https://ardupilot.org/sub/docs/common-polygon_fence.html#common-polygon-fence) for Copter and Rover.

<a id="basic-tuning"></a>

## Basic Tuning

For all vehicles, this shows the relevant basic tuning parameters for that vehicle’s attitude and navigation control loops. Read the Tuning section for that vehicle for explanations and instructions on how to tune.

<a id="extended-tuning-copter-only"></a>

## Extended Tuning (Copter only)

For Copter, the Basic Tuning screen is very simple to enable an easy way for beginners to generally adjust roll and pitch tuning. But this screen is similar to the Basic Tuning screen for Plane and Rover, showing the most common parameters for each control loop.

<a id="standard-params"></a>

## Standard Params

This screen provides access to parameters that most commonly adjusted by users to alter the behavior of the vehicle for each application.

<a id="advanced-params"></a>

## Advanced Params

This screen provides access to many parameters not normally adjusted by the average user, but by more advanced users.

<a id="onboard-osd"></a>

## OnBoard OSD

Some autopilots have integrated On Screen Display (OSD) capability. This provides a means to easily setup the display elements, layout, and parameters associated with these displays.

<a id="mavftp"></a>

## MAVftp

In firmware versions 4.1 and later, an integrated FTP (File Transfer Protocol) has been implemented to allow access to the SD card (if the autopilot has one) and internal flash file systems (See [ArduPilot File Systems](https://ardupilot.org/dev/docs/filesystems.html#filesystems)) via Mission Planner. (It is not recommended to use it for log download, use the DataFlash Logs button in the DATA screen, it’s faster).

<a id="user-params"></a>

## User Params

Currently, this allows easy access to setting the [Auxiliary Functions](https://ardupilot.org/sub/docs/common-auxiliary-functions.html#common-auxiliary-functions) on RC channels.

<a id="full-parameter-list"></a>

## Full Parameter List

Displays every parameter of the connected vehicle. Allows any parameter to be changed and the new value saved (with some minor exceptions for certain read-only parameters). You can also save parameters to a file and restore them from a file, or compare the current parameters to a saved file and decide which, if any to change to that file’s list.

 [[../_images/MP-fullparams.png](https://ardupilot.org/planner/_images/MP-fullparams.png)](https://ardupilot.org/planner/_images/MP-fullparams.png)

- Load from File: load saved parameters from a file
- Save to file: Save parameters to a file
- Write Params: Write the modified parameters on this screen to the autopilot
- Refresh Params: Reload the parameter list from the autopilot. Often this is required, to display a group of parameters that were just enabled, such when you enable Q\_ENABLE (QuadPlane enable mode) on Plane, or a battery monitor.
- Compare Params: Compares current parameters on the screen (including modified but not saved yet) to a file, and allows selection of which will be modified to that file’s value.

Note

An important aspect of the Compare Params feature: After you select the file with the saved parameters you want to compare, you will get a window that lists every parameter that is different. At this point nothing has been changed, but if you check some items and then click Continue, those items will be changed in the parameter screen of Mission Planner. You will then need to click the Write Params parameters button in the right-hand panel to copy the changes to your autopilot.

- Load Presaved: Many common vehicle platform typical parameters are available to load via the dropdown box. On loaded, they could be saved to the vehicle with the Write Params button
- Reset to Default: CAUTION! this will immediately reset all parameters to the vehicle’s default settings. Recalibration and setup via the SETUP menu will be required or a restore of previously save parameters from a file.
- Search: Allows a rapid search for parameters by name or included descriptions.
- Modified: Will display only parameters currently modified and unsaved.

<a id="full-parameter-tree"></a>

## Full Parameter Tree

A tree style view of the Full Parameter Screen.
