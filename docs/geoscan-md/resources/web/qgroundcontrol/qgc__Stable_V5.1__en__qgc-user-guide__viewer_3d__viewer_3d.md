---
title: "3D View | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/viewer_3d/viewer_3d.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "37846938615f814695e938f32ff68410bd6a9bb8e5a8dc7979a3d0515db9767c"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [3D View | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/viewer_3d/viewer_3d.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="_3d-view"></a>

# 3D View

WARNING

The entire 3D View feature is a work in progress. You may hit various issues while using it.

INFO

The 3D View is not available on Android, as rendering is not yet reliable across Android GPUs and drivers.

The 3D View is used to visualize and monitor the vehicle, the environment, and the planned mission in 3D. Most of the capabilities available in the [Fly View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html) is also available in the 3D View.

You can use it to:

- To import and display the 3D map for any region of interest downloaded from the OpenStreetMap website (.osm file).
- Display the vehicle along with its mission in 3D.
- And most of the capabilities of the [Fly View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html), including:

  - Run an automated [pre-flight checklist](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#preflight_checklist).
  - Arm the vehicle (or check why it won't arm).
  - Control missions: [start](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#start_mission), [continue](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#continue_mission), [pause](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#pause), and [resume](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#resume_mission).
  - Guide the vehicle to [arm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#arm)/[disarm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#disarm)/[emergency stop](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#emergency_stop), [takeoff](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#takeoff)/[land](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#land), [change altitude](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#change_altitude), and [return/RTL](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#rtl).
  - Switch between a map view and a video view (if available)
  - Display video, mission, telemetry, and other information for the current vehicle, and also switch between connected vehicles.

<a id="ui-overview"></a>

# UI Overview

The main elements of the 3D View are the same as the [Fly View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html), with an added 3D environment.

**Enabling the 3D View:** The 3D View is disabled by default. To enable it, go to **Settings \> Fly View**, and under the **3D View** settings group, toggle the **Enabled** switch.

To open the 3D View, when you are in the [Fly View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html), select the 3D View icon from the toolbar on the left.

<a id="view-controls"></a>

## View Controls

The camera controls work like Gazebo: gestures are anchored to the ground point under the cursor, so the spot you grab stays under the cursor while you pan, orbit, or zoom.

- **Mouse:**

  - **Pan**: Press and hold the left mouse button, then move the cursor. The ground point you grabbed follows the cursor.
  - **Orbit (rotate)**: Press and hold the middle mouse button (scroll wheel), then move the cursor. The view rotates around the ground point under the cursor: dragging left/right changes heading (a full window width of drag is one full revolution), dragging up/down changes the viewing angle between top-down and near-horizontal.
  - **Orbit (trackpad-friendly)**: Hold **Shift** and drag with the left button. This is useful on trackpads without a middle button.
  - **Zoom**: Use the mouse wheel or trackpad scroll, or press and hold the right mouse button and drag up (zoom in) or down (zoom out). Zooming moves toward or away from the ground point under the cursor, keeping it fixed on screen.
- **Touchscreen:**

  - **Pan**: Tap and move with a single finger.
  - **Zoom**: Pinch with two fingers, moving them together or apart.
  - **Rotate**: Twist with two fingers. The view rotates around the ground point under the gesture, following your fingers.
  - **Tilt**: Swipe up or down with two fingers held together. Swiping up tilts toward the horizon, swiping down toward a top-down view.

A **scale bar** is shown in the same position as in the Fly View (top of the view, next to the tool strip) and shows the ground distance covered on screen. In a perspective view the scale varies across the screen; the value shown is exact for the ground plane through the screen center.

To visualize the 3D map of a particular area in the 3D viewer, you have to download the .osm file of that area from the [OpenStreetMap](https://www.openstreetmap.org/#map=16/47.3964/8.5498) website and then import it through the **3D View** settings. More details on the **3D View** settings can be found in the next section.

If no OSM file is loaded, buildings are not shown, but the 3D View still displays the vehicle over a map-tile ground patch centered on the vehicle's home position, viewed from the side by default.

<a id="settings"></a>

# Settings

You can change the settings of the 3D View from **Application Settings** -\>**Fly View** tab under the **3D View** settings group. The following properties can be modified in the 3D View settings group:

- **Enabled**: To enable or disable the 3D View.
- **3D Map File**: The path to the .osm file of a region of interest to be visualized in the QGC. The .osm file can be uploaded by clicking on the **Select File** button. To clear the 3D View from the previously loaded .osm file, you can click on the **Clear** button.
- **Average Building Level Height**: This parameter determines the height of each storey of the buildings, as in .osm file sometimes the height of the buildings is specified in terms of the level/storey.
- **Vehicle Altitude Bias**: This refers to the bias in the altitude of vehicles and their missions with respect to the ground level. It is helpful in cases where the estimated altitude of the vehicle by its flight control is biased, as the relative altitude is currently used in the 3D View.
