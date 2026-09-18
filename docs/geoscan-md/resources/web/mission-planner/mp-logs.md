---
title: "Logs — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-logs.html"
retrieved_at: "2026-09-15T18:09:54.449192+00:00"
source_sha256: "f4806bb50b01fe87a74d86a1af9d258d2b30f51c1b3314197b03005c7ad8cfb3"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Logs — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-logs.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="logs"></a>

<a id="common-logs"></a>

# Logs

<a id="log-types-dataflash-vs-tlogs"></a>

## Log Types (Dataflash vs Tlogs)

There are two ways to record your flight data. With some exceptions, the two methods record very similar data but in different ways:

- [Dataflash logs](https://ardupilot.org/planner/docs/common-downloading-and-analyzing-data-logs-in-mission-planner.html#common-downloading-and-analyzing-data-logs-in-mission-planner) are recorded on the autopilot (often to the SD card) so they must be downloaded from the autopilot after a flight
- [Telemetry logs](https://ardupilot.org/planner/docs/mission-planner-telemetry-logs.html#mission-planner-telemetry-logs) (also known as “Tlogs”) are recorded by the ground station (i.e. Mission Planner) on the local PC when the autopilot is connected via a [telemetry link](https://ardupilot.org/sub/docs/common-telemetry-landingpage.html#common-telemetry-landingpage)

If you are not yet familiar with the basics of these log files, first review the introductory pages to understand where these logs are stored and how you can download and view the information held within them.

<a id="topics-related-to-logging-and-analysis"></a>

### Topics related to logging and analysis

- [Dataflash Logs](https://ardupilot.org/planner/docs/common-downloading-and-analyzing-data-logs-in-mission-planner.html)
- [Telemetry Logs](https://ardupilot.org/planner/docs/mission-planner-telemetry-logs.html)
- [Diagnosing problems using Logs](https://ardupilot.org/planner/docs/common-diagnosing-problems-using-logs.html)
- [Measuring Vibration](https://ardupilot.org/planner/docs/common-measuring-vibration.html)
- [Measuring Vibration with "Batch Sampling"](https://ardupilot.org/planner/docs/common-imu-batchsampling.html)
- [Measuring Vibration with "Raw IMU Logging" (Preferred)](https://ardupilot.org/planner/docs/common-raw-imu-logging.html)

<a id="tools-for-log-analysis"></a>

### Tools for Log Analysis

- [MAVExplorer](https://ardupilot.org/dev/docs/using-mavexplorer-for-log-analysis.html)
- [ArduPilot WebTools](https://ardupilot.org/planner/docs/common-webtools.html)
- [MissionPLanner](https://ardupilot.org/planner/)
- [QGroundControl](http://qgroundcontrol.com/)
- [Dronee Plotter](https://plot.dronee.aero/)
- [PlotJuggler](https://discuss.ardupilot.org/t/log-inspection-with-plotjuggler/122216)
