---
title: "First Flight Guide | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/getting_started/quick_start.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "59a279ebd17b06b5b9d0b8e045da54ad46eb9d57021234e513169236b215994b"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [First Flight Guide | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/getting_started/quick_start.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="first-flight-guide"></a>

# First Flight Guide

This guide walks you through connecting your vehicle, verifying it's ready, and executing your first flight.

<a id="_1-connect-your-vehicle"></a>

## 1. Connect Your Vehicle

Start *QGroundControl*, then connect your vehicle using one of these methods:

- **USB** — plug the flight controller directly into your computer
- **Telemetry radio** — connect a ground-side radio module via USB
- **WiFi / Ethernet** — connect to the vehicle's network (common for companion computers and some commercial drones)

QGC auto-detects most connections. If your vehicle doesn't appear, check **Application Settings \> Comm Links** to verify settings or create a manual link.

INFO

Make sure QGC has an internet connection when you connect a new vehicle so the map loads correctly.

<a id="_2-check-vehicle-status"></a>

## 2. Check Vehicle Status

Once connected, look at the **toolbar indicators** across the top of the screen. Each icon shows a subsystem status — tap any indicator for details:

- **GPS** — satellite count and fix type (3D fix required for most flight modes)
- **Battery** — voltage and remaining capacity
- **RC** — transmitter connection status
- **Telemetry** — link signal quality
- **Flight Mode** — current mode (tap to change)
- **Armed/Disarmed** — arming state (tap to arm/disarm)

<a id="_3-calibrate-new-vehicles"></a>

## 3. Calibrate (New Vehicles)

For a new vehicle, QGC opens [Vehicle Configuration](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/setup_view.html) automatically. Complete these steps in order:

1. **[Firmware](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/firmware.html)** — install or update flight controller firmware (USB only)
2. **Airframe / Frame** — select your vehicle type and frame layout
3. **Sensors** — calibrate compass, accelerometer, gyroscope, and (if equipped) level horizon
4. **Radio** — calibrate your RC transmitter stick ranges
5. **Flight Modes** — assign flight modes to transmitter switches
6. **Power** — configure battery cell count and voltage sensing

Parameters and other settings can be adjusted later. See the [PX4](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/sensors_px4.html) or [ArduPilot](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/sensors_ardupilot.html) sensor pages for firmware-specific guidance.

<a id="_4-plan-a-simple-mission-optional"></a>

## 4. Plan a Simple Mission (Optional)

Open the **Planning Missions** view to create a basic waypoint mission:

1. Tap the map to place a takeoff point
2. Tap additional locations to add waypoints
3. Set the desired altitude for each waypoint (or accept the default)
4. Upload the mission to the vehicle

See [Planning Missions](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html) for details on surveys, geofences, and rally points.

<a id="_5-fly"></a>

## 5. Fly

Switch to the **Flying** view. You should see a map centered on your vehicle's GPS position with the HUD overlay showing attitude.

**To fly a mission:**

1. Confirm all toolbar indicators are green/nominal
2. Slide to arm (or tap the arm indicator)
3. Tap **Start Mission** — the vehicle will take off and follow the planned route
4. Monitor progress in the toolbar and map
5. When the mission completes, the vehicle returns to launch and lands automatically (depending on firmware settings)

**To fly manually:**

1. Arm the vehicle via QGC or your transmitter
2. Take off using your transmitter
3. Use the **Fly Tools** (left edge of the map) for vehicle actions: Return to Launch, Land, Pause, Change Altitude, Go To Location, Orbit

<a id="_6-after-landing"></a>

## 6. After Landing

- **Review telemetry** — open [Analysis & Logs](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/) to download and inspect flight logs
- **Download logs** — use [Log Download](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/log_download.html) to pull logs from the vehicle for post-flight analysis

<a id="troubleshooting"></a>

## Troubleshooting

- Vehicle not connecting? See [Connection Problems](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/vehicle_connection.html)
- Parameters won't download? See [Parameter Download Failures](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/parameter_download.html)
- Mission won't upload? See [Plan Upload/Download Failures](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/plan_upload_download.html)
