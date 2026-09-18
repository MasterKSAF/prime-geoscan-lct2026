---
title: "Fly View Settings | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/fly_view.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "a3e83e7c6d9b722ec6c0258aaebc8e0f6b920412015f51933c3a411f8915dec9"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Fly View Settings | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/fly_view.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="fly-view-settings"></a>

# Fly View Settings

Settings that control the behavior and appearance of the [Fly View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html).

<a id="general"></a>

## General

- **Use preflight checklist** — enable the pre-flight checklist tool in the Fly View
- **Enforce checklist** — prevent arming until all checklist items are complete
- **Enable multi-vehicle panel** — show the multi-vehicle list when more than one vehicle is connected
- **Keep Map Centered On Vehicle** — prevent the map from drifting away from the vehicle position
- **Show Telemetry Log Replay Status Bar** — display the replay control bar when playing back telemetry logs
- **Show simple camera controls (DIGICAM\_CONTROL)** — show basic camera trigger controls for autopilot-connected cameras
- **Update return to home position based on device location** — send the GCS position as the vehicle's home/RTL point
- **Enable automatic mission start/resume popups** — show mission start and resume prompts automatically

<a id="guided-commands"></a>

## Guided Commands

- **Minimum Altitude** — lowest altitude allowed for guided mode commands (default: 2 m)
- **Maximum Altitude** — highest altitude allowed for guided mode commands (default: 121.92 m / 400 ft)
- **Go To Location Max Distance** — maximum distance for Go To commands (default: 1000 m)
- **Loiter Radius in Forward Flight Guided Mode** — loiter radius for fixed-wing guided mode (default: 80 m)
- **Require Confirmation for Go To Location in Guided Mode** — require confirmation before executing Go To

<a id="mavlink-actions"></a>

## MAVLink Actions

- **Fly View Actions file** — JSON file defining custom MAVLink actions available in the Fly View
- **Joystick Actions file** — JSON file defining custom MAVLink actions triggered by joystick buttons

<a id="virtual-joystick"></a>

## Virtual Joystick

- **Virtual joystick** — enable on-screen virtual thumbsticks for vehicle control
- **Auto-center throttle** — return throttle to center when released
- **Left-handed mode** — swap the throttle and direction sticks

<a id="instrument-panel"></a>

## Instrument Panel

- **Show additional heading indicators on Compass** — display extra heading markers
- **Lock Compass Nose-Up** — keep the compass oriented nose-up instead of rotating with heading
- **Instrument panel style** — choose between Integrated, Horizontal, or Large Vertical layouts
