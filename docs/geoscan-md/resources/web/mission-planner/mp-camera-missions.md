---
title: "Camera Control in Auto Missions — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-camera-control-and-auto-missions-in-mission-planner.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "78dc8ad629fee124c66feef886ad8e23ec2cd7813c9ab84ea8be7ca080e7cac7"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Camera Control in Auto Missions — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-camera-control-and-auto-missions-in-mission-planner.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="camera-control-in-auto-missions"></a>

<a id="common-camera-control-and-auto-missions-in-mission-planner"></a>

# Camera Control in Auto Missions

This article describes ArduPilot’s camera and gimbal commands, and explains how these can be used in Mission Planner to define camera survey missions. These instructions assume a [camera trigger and gimbal have already been connected and configured](https://ardupilot.org/sub/docs/common-cameras-and-gimbals.html#common-cameras-and-gimbals).

<a id="overview"></a>

## Overview

Planning a camera mission is almost exactly the same as [planning any other mission with waypoints and events](https://ardupilot.org/planner/docs/common-planning-a-mission-with-waypoints-and-events.html#common-planning-a-mission-with-waypoints-and-events). The only difference is that in a camera mission you specify commands to trigger the camera shutter at waypoints or at regular intervals as the vehicle moves. If the camera is mounted on a gimbal, you can also set the gimbal orientation, or make it track a particular point of interest.

For simple missions you can manually specify the required waypoints and camera commands. For more complex paths and grid surveys Mission Planner makes things easy by providing tools to automatically generating the required mission for arbitrary regions.

<a id="camera-commands"></a>

### Camera commands

- `DO_SET_CAM_TRIGG_DIST` — Trigger the camera shutter at regular intervals. This is most commonly used for supporting area surveys.
- `DO_DIGICAM_CONTROL` — Trigger the camera shutter once every time this command is called.
- `DO_AUX_FUNCTION` — allows any [auxiliary function](https://ardupilot.org/sub/docs/common-auxiliary-functions.html#common-auxiliary-functions) to be executed from within a mission without setting up an auxiliary switch. This includes camera start recording, camera zoom, camera manual focus and camera auto focus.

<a id="camera-gimbal-commands"></a>

### Camera gimbal commands

If a camera gimbal is used, you can set the camera position (yaw, tilt, roll) or aim it at a specific region of interest (ROI):

- `DO_SET_ROI` — Target the camera towards a specified region of interest (position, including altitude).
- `DO_GIMBAL_MANAGER_PITCHYAW` — Move the gimbal to the desired pitch and yaw angles (in degrees). Positive pitch angles are up, Negative are down. Positive yaw angles are clockwise, negative are counter clockwise. If the “Flags” field is “0” the yaw angle is in “body frame” (e.g. 0 is forward). If “Flags” is “16” the yaw angle is in “earth frame” (e.g. 0 is North).
- `DO_MOUNT_CONTROL` — Position the gimbal with the specified roll, pitch and yaw.

<a id="servo-and-relay-commands"></a>

### Servo and Relay commands

Servos and relay outputs can be connected to hardware and activated during missions using the `DO_SET_SERVO` or `DO_SET_RELAY` commands, respectively.

One possible use for these outputs is to control camera features other than the shutter (for example, to set the zoom level or switch capture from still to video).

Note

The method used to connect your servo or relay to the camera, and what features are accessible, will depend the camera and its supported remote-control mechanism(s) (see the [Camera Control and GeoTagging section of the Cameras and Gimbals wiki page](https://ardupilot.org/sub/docs/common-cameras-and-gimbals.html#common-cameras-and-gimbals))

<a id="auto-mission-types"></a>

## Auto-mission types

Mission Planner supports the following *Auto Waypoint* options. To access these open the *Flight Plan* screen, right-click on the map and select the option from under the *Auto WP* menu:

- **Create WP Circle** — Create a circle of waypoints.
- **Area** — Displays the area of the current polygon (if defined).
- **Create Spline Circle** — A circle where the altitude of waypoints follows a rising spline (relevant to flying vehicles).
- **Survey (Grid)** — Automatically create waypoints and camera control commands to survey a specified polygon.
- **Survey (Gridv2)** — *Under construction!* This is a simpler grid control for creating a rectangular survey area.
- **SimpleGrid** — A simple auto-created survey grid. No camera control is defined, so this must be added separately.

The following sections include community-provided examples of automatic survey missions.

<a id="survey-grid-example"></a>

<a id="common-camera-control-and-auto-missions-in-mission-planner-survey-grid-example"></a>

### Survey (Grid) Example

Mission Planner’s *Survey (Grid)* option automatically defines the waypoints required to cover an arbitrary polygon, and sets `DO_SET_CAM_TRIGG_DIST` on relevant waypoints to ensure that pictures are captured at regular intervals in the vehicle’s path.

- Open the *Flight Plan* tab
- **Right click** on the map, and select **Draw Polygon | Add PolyGon Point**. Create points surrounding the area to be photographed.
- **Right click** on the map and select **Auto WP | Survey(Grid)**:

  [[surveyexample](https://ardupilot.org/planner/_images/surveyexample.jpg)](https://ardupilot.org/planner/_images/surveyexample.jpg)
- *Mission Planner* will then display a configuration screen where you can define the camera make/model and other parameters including the overlap you want between pictures, lens size, etc. `DO_SET_CAM_TRIGG_DIST` is automatically calculated based on this information!

  [[surveyexample2](https://ardupilot.org/planner/_images/surveyexample2.jpg)](https://ardupilot.org/planner/_images/surveyexample2.jpg)

After clicking on **Accept**, *Mission Planner* will generate a list of waypoints covering the specified area, and including take-off and landing waypoints. The `DO_SET_CAM_TRIGG_DIST` command is called to set the distance in meters between two camera triggers during your mission. At the end of the mission `DO_SET_CAM_TRIGG_DIST` is called again to set the parameter back to zero (stops capturing images).

The final mission with waypoints and camera triggers looks like this:

 [[../_images/mp_camera_control_mission.jpg](https://ardupilot.org/planner/_images/mp_camera_control_mission.jpg)](https://ardupilot.org/planner/_images/mp_camera_control_mission.jpg)

The test mission shown above was run. It generated 15 images, which have been stitched together. A thumbnail of the composite image is shown below (because the full size image is too large at about 107 MBytes).

 [[../_images/Mortierthumbnail2.jpg](https://ardupilot.org/planner/_images/Mortierthumbnail2.jpg)](https://ardupilot.org/planner/_images/Mortierthumbnail2.jpg)

<a id="creating-composite-images"></a>

## Creating composite images

There are a number of good free and paid tools for creating composite images:

- [Pix4Dmapper](https://www.pix4d.com/) - The free “discovery” version supports image merging.
- [Microsoft Image Composite Editor (ICE)](http://research.microsoft.com/en-us/um/redmond/projects/ice/)
