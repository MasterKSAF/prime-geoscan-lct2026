---
title: "Scripting (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/scripting.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "564b5a95464b5a2e8a3eacba47f974af5f9bae50eca24a96c7124cd23349c0d8"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Scripting (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/scripting.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="scripting-ardupilot"></a>

# Scripting (ArduPilot)

The Scripting page manages Lua scripts on ArduPilot vehicles that support onboard scripting.

<a id="enable-scripting"></a>

## Enable Scripting

- **Enable Scripting** — toggle the `SCR_ENABLE` parameter to allow Lua scripts to run on the flight controller

<a id="script-management"></a>

## Script Management

Scripts are stored in the `/APM/scripts/` directory on the vehicle's SD card. The page provides:

- **Upload** — select a `.lua` file from your computer and upload it to the vehicle via MAVLink FTP
- **Script list** — shows all `.lua` files currently on the vehicle

  - **Download** — save a script from the vehicle to your local filesystem
  - **Delete** — remove a script from the vehicle (with confirmation dialog)

After uploading or deleting scripts, you may need to reboot the flight controller for changes to take effect.
