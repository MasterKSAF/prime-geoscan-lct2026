---
title: "Loading Firmware | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/firmware.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "d7cb2acfde7d06477d2fae0d6fd92cdce3bb797ae315e05f022ca1e05c4ea836"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Loading Firmware | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/firmware.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="loading-firmware"></a>

# Loading Firmware

*QGroundControl* **desktop** versions can install [PX4 Pro](http://px4.io/) or [ArduPilot](http://ardupilot.com) firmware onto Pixhawk-family flight-controller boards. By default QGC will install the current stable version of the selected autopilot, but you can also choose to install beta builds, daily builds, or custom firmware files.

*QGroundControl* can also install the firmware for SiK Radios and PX4 Flow devices.

> **Caution** Loading Firmware is currently not available on tablet or phone versions of *QGroundControl*.

<a id="connect-device-for-firmware-update"></a>

## Connect Device for Firmware Update

> **Caution** **Before you start installing Firmware** all USB connections to your vehicle must be *disconnected* (both direct or through a telemetry radio). The vehicle must *not be* powered by a battery.

1. First select the **Gear** icon (*Vehicle Setup*) in the top toolbar and then **Firmware** in the sidebar.
2. Connect your device (Pixhawk, SiK Radio, PX4 Flow) directly to your computer via USB.

   INFO

   Connect directly to a powered USB port on your machine (do not connect through a USB hub).

<a id="select-firmware-to-load"></a>

## Select Firmware to Load

Once the device is connected you can choose which firmware to load (*QGroundControl* presents sensible options based on the connected hardware).

1. For a Pixhawk-compatible board choose either **PX4 Flight Stack vX.X.X Stable Release** or **ArduPilot Flight Stack** radio buttons to download the *current stable release*.

   If you select *ArduPilot* you will also have to choose the specific firmware and the type of vehicle (as shown below).
2. Check **Advanced settings** to select specific developer releases or install firmware from your local file system.

<a id="update-the-firmware"></a>

## Update the firmware

1. Click the **OK** button to start the update.

   The firmware will then proceed through a number of upgrade steps (downloading new firmware, erasing old firmware etc.). Each step is printed to the screen and overall progress is displayed on a progress bar.

Once the firmware has finished loading the device/vehicle will reboot and reconnect. Next you will need to configure the [airframe](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/airframe.html) (and then sensors, radio, etc.)
