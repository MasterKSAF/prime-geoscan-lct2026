---
title: "Fly View | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "2c4f19966344809921259aba71950926a7753a6f43ce2cb713a352559f666c5d"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Fly View | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="fly-view"></a>

# Fly View

Having trouble?

For connection issues, see [Connection Problems](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/vehicle_connection.html). For mission resume issues during flight, see [Resume Mission Failures](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/resume_mission.html).

The Fly View is used to command and monitor the vehicle.

<a id="overview"></a>

## Overview

[Fly View overview](https://docs.qgroundcontrol.com/Stable_V5.1/assets/fly_view_overview.DBU46-Va.svg)

- **View Selector:** Allows you to switch between the main views (Fly, Plan, Analyze, Vehicle Configuration, Application Settings).
- **[Status Indicators](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view_toolbar.html):** Shows flight status and mode as well as the status of the main components of the vehicle.
- **[Actions](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html):** Allows you to command the vehicle to take a specific action.
- **[Camera Tools](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/camera_tools.html):** Switch between still and video modes, start/stop capture, and control camera settings.
- **[Video](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/video.html):** Display the video from the vehicle. Allows you to toggle between video or map as the main display.
- **[Telemetry Values](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/instrument_panel.html):** Displays configurable telemetry values.
- **[Attitude/Compass](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html):** Provides virtual horizon and heading information.
- **Map:** Displays the positions of all connected vehicles and the mission for the current vehicle. Can be switched between multiple variations.

  - You can drag the map to move it around (the map automatically re-centres on the vehicle after a certain amount of time).
  - You can zoom the map in and out using the zoom buttons, mouse wheel, track pad or pinch on a tablet.
  - Once flying, you can click on the map to set a [Go to](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html#map_actions) or [Orbit at](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html#map_actions) location.

There are a number of other elements that are not displayed by default and are only displayed in certain conditions or for certain vehicle types.

<a id="actions-tasks"></a>

## Actions/Tasks

The following sections describe how to perform common operations/tasks in the Fly View.

INFO

Many of the available options depend on both the vehicle type and its current state.

<a id="map_actions"></a>

### Actions associated with a map position

There are a number of actions which can be taken which are associated with a specific position on the map. To use these actions:

1. Click on the map at a specific position
2. A popup will display showing you the list of available actions
3. Select the action you want
4. Confirm the action

Examples of map position actions are Go To Location, Orbit and so forth.

<a id="pause"></a>

### Pause

You can pause most operations, including taking off, landing, RTL, mission execution, orbit at location. The vehicle behaviour when paused depends on the vehicle type; typically a multicopter will hover, and a fixed wing vehicle will circle.

INFO

You cannot pause a *Goto location* operation.

To pause:

1. Press the **Pause** button in the *Fly Tools*.
2. Optionally set a new altitude using the right-side vertical slider.
3. [Confirm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html#confirmation) the action.

<a id="missions"></a>

### Missions

<a id="start_mission"></a>

#### Start Mission

You can start a mission when the vehicle is landed (the start mission confirmation button is often displayed by default).

To start a mission from landed:

1. Press the **Action** button on the *Fly Tools*
2. Select the *Start Mission* action from the dialog.
3. [Confirm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html#confirmation) the action to start the mission.

<a id="continue_mission"></a>

#### Continue Mission

You can *continue* mission from the *next* waypoint when you're flying (the *Continue Mission* confirmation button is often displayed by default after you takeoff).

INFO

Continue and [Resume mission](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html#resume_mission) are different! Continue is used to restart a mission that has been paused, or where you have taken off, so you've already missed a takeoff mission command. Resume mission is used when you've used a RTL or landed midway through a mission (e.g. for a battery change) and then wish to continue the next mission item (i.e. it takes you to where you were up to in the mission, rather than continuing from your place in the mission).

You can continue the current mission while (unless already in a mission!):

1. Press the **Action** button on the *Fly Tools*
2. Select the *Continue Mission* action from the dialog.
3. [Confirm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html#confirmation) the action to continue the mission.

<a id="resume_mission"></a>

#### Resume Mission

*Resume Mission* is used to resume a mission after performing an [RTL/Return](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#rtl) or [Land](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#land) from within a mission (in order, for example, to perform a battery change).

INFO

If you are performing a battery change, **do not** disconnect QGC from the vehicle after disconnecting the battery. After you insert the new battery *QGroundControl* will detect the vehicle again and automatically restore the connection.

After landing you will be prompted with a *Flight Plan complete* dialog, which gives you the option to remove the plan from the vehicle, leave it on the vehicle, or to resume the mission from the last waypoint that was traveled through.

If you select to resume the mission, then *QGroundControl* will rebuild the mission and upload it to the vehicle. Then [confirm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html#confirmation) the action to continue the mission.

INFO

A mission cannot simply resume from the last mission item that the vehicle executed, because there may be multiple items at the last waypoint that affect the next stage of the mission (e.g. speed commands or camera control commands). Instead *QGroundControl* rebuilds the mission, starting from the last mission item flown, and automatically prepending any relevant commands to the front of the mission.

<a id="resume_mission_prompt"></a>

#### Remove Mission Prompt After Landing

You will be prompted to remove the mission from the vehicle after the mission completes and the vehicle lands and disarms. This is meant to prevent issues where stale missions are unknowingly left on a vehicle, potentially resulting in unexpected behavior.

<a id="video_switcher"></a>

### Display Video

When video streaming is enabled, *QGroundControl* will display the video stream for the currently selected vehicle in the "video switcher window" at the bottom left of the map. You can press the switcher anywhere to toggle *Video* and *Map* to foreground.

INFO

Video streaming is configured/enabled in [Application Settings \> General tab \> Video](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html#video).

You can further configure video display using controls on the switcher:

- Resize the switcher by dragging the icon in the top right corner.
- Hide the switcher by pressing the toggle icon in the lower left.
- Detach the video switcher window by pressing on the icon in its top left corner (once detached, you can move and resize the window just like any other in your OS). If you close the detached window the switcher will re-lock to the QGC Fly view.

<a id="record-video"></a>

### Record Video

If supported by the camera and vehicle, *QGroundControl* can start and stop video recording on the camera itself. *QGroundControl* can also record the video stream and save it locally.

TIP

Video stored on the camera may be of much higher quality, but it is likely that your ground station will have a much larger recording capacity.

<a id="record-video-stream-on-gcs"></a>

#### Record Video Stream (on GCS)

Video stream recording is controlled on the [video stream instrument page](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#video_instrument_page). Press the red circle to start recording a new video (a new video file is created each time the circle is pressed); the circle will change into a red square while recording is in progress.

Video stream recording is configured in the [Application Settings \> General tab](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html):

- [Video Recording](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html#video-recording) - specifies the recording file format and storage limits.

  INFO

  Videos are saved in Matroska format (.mkv) by default. This format is relatively robust against corruption in case of errors.
- [Miscellaneous](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html#miscellaneous) - Streamed video is saved under the **Application Load/Save Path**.

TIP

The stored video includes just the video stream itself. To record video with QGroundControl application elements displayed, you should use separate screen recording software.

<a id="record-video-on-camera"></a>

#### Record Video on Camera

Start/stop video recording *on the camera itself* using the [camera instrument page](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#camera_instrument_page). First toggle to video mode, then select the red button to start recording.
