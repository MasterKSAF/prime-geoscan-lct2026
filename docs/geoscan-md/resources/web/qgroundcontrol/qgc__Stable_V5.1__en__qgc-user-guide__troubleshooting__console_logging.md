---
title: "Console Logging | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "cee92bbe8edf08806ab451412a1fef2f66a89251e78b0b2ac3ebc0509e632748"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Console Logging | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="console-logging"></a>

# Console Logging

The *App Log Viewer* can be a helpful tool for diagnosing *QGroundControl* problems. It can be found in **Application Settings \> App Log Viewer**.

[App Log Viewer](https://docs.qgroundcontrol.com/Stable_V5.1/assets/app_log_viewer.Cc04db9F.jpg)

Click the **Categories** button to enable/disable the logging categories displayed by *QGroundControl*.

<a id="common-logging-categories"></a>

## Common Logging Categories

The most commonly used logging categories are listed below.

| Category(s) | Description |
| --- | --- |
| `Comms.LinkManager`, `Vehicle.MultiVehicleManager` | Debug connection problems. |
| `Comms.LinkManager:verbose` | Debug serial ports not being detected. Very noisy continuous output of available serial ports. |
| `VehicleSetup.FirmwareUpgrade` | Debug firmware flash issues. |
| `FactSystem.ParameterManager` | Debug parameter load problems. |
| `FactSystem.ParameterManager:debugCacheFailure` | Debug parameter cache crc misses. |
| `PlanManager.PlanManager`, `PlanManager.MissionManager`, `PlanManager.GeoFenceManager`, `PlanManager.RallyPointManager` | Debug Plan upload/download issues. |
| `AutoPilotPlugins.RadioComponentController` | Debug Radio calibration issues. |

<a id="logging-from-the-command-line"></a>

## Logging from the Command Line

An alternate mechanism for logging is using the `--logging` command line option. This is handy if you are trying to get logs from a situation where *QGroundControl* crashes.

How you do this and where the traces are output vary by OS:

- Windows

  - You must open a command prompt, change directory to the **qgroundcontrol.exe** location, and run it from there:

    sh

    ```text
    cd "\Program Files (x86)\qgroundcontrol"
    qgroundcontrol --logging:full
    ```
  - When *QGroundControl* starts you should see a separate console window open which will have the log output
- OSX

  - You must run *QGroundControl* from Terminal. The Terminal app is located in Applications/Utilities. Once Terminal is open paste the following into it:

    sh

    ```text
    cd /Applications/qgroundcontrol.app/Contents/MacOS/
    ./qgroundcontrol --logging:full
    ```
  - Log traces will output to the Terminal window.
- Linux

  sh

  ```text
  ./qgroundcontrol-start.sh --logging:full
  ```

  - Log traces will output to the shell you are running from.
