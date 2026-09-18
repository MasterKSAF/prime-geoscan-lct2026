---
title: "Vehicle Configuration | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/setup_view.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "e01541a39f1923577e621a7bb610ff3dd9669931d4dafb3b67d827371b55aa7a"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Vehicle Configuration | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/setup_view.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="vehicle-configuration"></a>

# Vehicle Configuration

Having trouble?

If QGC won't connect to your vehicle, see [Connection Problems](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/vehicle_connection.html). If parameters fail to load, see [Parameter Download Failures](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/parameter_download.html).

The Vehicle Configuration view is used to configure a new vehicle prior to first flight and/or tune a configured vehicle.

<a id="search"></a>

## Search

Use the **search bar** at the top of the configuration sidebar to find any setting by name. As you type, matching settings are shown across all pages — click a result to jump directly to that setting.

<a id="configuration-pages"></a>

## Configuration Pages

To the left of the screen are the available configuration pages. A page is marked with a red icon if there are still settings needed to be adjusted/specified. You should not fly if any of these are red.

INFO

The set of pages shown and the contents of each page may differ based on whether the vehicle is running PX4 or ArduPilot firmware.

**Summary**
An overview of all the important configuration options for your vehicle. Summary blocks show a red indicator when settings are not fully configured.

**PX4-specific pages:** [Actuators / Motors](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/px4/actuators.html), [Airframe](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/airframe_px4.html), [Flight Modes](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/flight_modes_px4.html), [PID Tuning](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/tuning_px4.html), [Power](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/power.html), [Radio](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/radio.html), [Safety](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/safety.html), [Sensors](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/sensors_px4.html)

**ArduPilot-specific pages:** [ESC](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/esc.html), [Failsafes](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/failsafes.html), [Flight Modes](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/flight_modes_ardupilot.html), [Flight Safety](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/flight_safety.html), [Frame](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/airframe_ardupilot.html), [Gimbal](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/camera.html), [Logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/logging_ardupilot.html), [Motors](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/motors.html), [Power](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/power.html), [Radio](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/radio.html), [Remote Support](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/remote_support.html), [Scripting](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/scripting.html), [Sensors](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/sensors_ardupilot.html), [Servo Outputs](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/servo_outputs.html), [Tuning](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/tuning_ardupilot.html), [Vehicle-Specific](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/vehicle_specific.html)

**Shared pages:**

**[Joystick](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/joystick.html)**
Configure a joystick or gamepad for vehicle control.

**[Firmware](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/firmware.html)**
Flash new firmware onto the flight controller.

**[Parameters](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/parameters.html)**
View and modify all parameters associated with your vehicle.
