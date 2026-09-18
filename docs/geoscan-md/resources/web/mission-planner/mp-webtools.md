---
title: "ArduPilot WebTools — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-webtools.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "8a73b411154b058ea0ae09a56883eb6d6c82dbb8dac5c69382468760b0402dc4"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [ArduPilot WebTools — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-webtools.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="ardupilot-webtools"></a>

<a id="common-webtools"></a>

# [ArduPilot WebTools](https://firmware.ardupilot.org/Tools/WebTools/)

This is a collection of log analysis tools that are web-based.

<a id="uav-log-viewer"></a>

## [UAV Log Viewer](https://ardupilot.org/planner/docs/common-uavlogviewer.html#common-uavlogviewer)

For plotting log file data versus time, 3D earth track of flight,access to parameters,etc.

[../_images/UAVLogViewer_Icon.gif](https://ardupilot.org/planner/_images/UAVLogViewer_Icon.gif)

<a id="hardware-report"></a>

## [Hardware Report](https://firmware.ardupilot.org/Tools/WebTools/HardwareReport/)

Provides a overview of connected hardware from a parameter file or log. If a log is used, more information can be provided, such as sensor health status and exact firmware version. A range of options are available to extract mission, lua scripts used, and parameters from logs: all, only changed, or minimal removing calibration parameters. Includes visualization for sensor position offsets.

[../_images/HardwareReport_Icon.png](https://ardupilot.org/planner/_images/HardwareReport_Icon.png)

<a id="magfit"></a>

## [MAGFit](https://firmware.ardupilot.org/Tools/WebTools/MAGFit/)

Used to calibrate or fine tune calibration of compass from flight log. This tool fits the logged magnetometer data to the world magnetic model providing offsets, iron correction, scale, motor compensation and checks for proper orientation.

[../_images/MAGFit_Icon.png](https://ardupilot.org/planner/_images/MAGFit_Icon.png)

<a id="filter-review"></a>

## [Filter Review](https://firmware.ardupilot.org/Tools/WebTools/FilterReview/)

Gyro noise and filter configuration tool. Uses raw or batch IMU logs to show the vehicle’s noise profile. Filters can be applied to logged pre-filter data to see the effect without the need to fly again. Advanced user tool, more instructions on use coming.

[../_images/FilterReview_Icon.png](https://ardupilot.org/planner/_images/FilterReview_Icon.png)

<a id="filter-tool"></a>

## [Filter Tool](https://firmware.ardupilot.org/Tools/WebTools/FilterTool/)

Bode plot tool to give insight into gyro low pass and notch filter setup. This tool visualizes the attenuation and phase lag of a filter setup loaded from a parameter file. For filter setup the FilterReview tool it is recommended it provides the same bode plot feedback. This filter tool allows the attenuation and phase lag of each filter to be plotted individually, something which the filter review tool cannot do. This tool also provides a estimated response for the rate PID gains. Advance user tool.

[../_images/FilterTool_Icon.png](https://ardupilot.org/planner/_images/FilterTool_Icon.png)

<a id="pid-review"></a>

## [PID Review](https://firmware.ardupilot.org/Tools/WebTools/PIDReview/)

Review PID tune in the frequency domain. Step response estimate is generated. Results are split based on parameter changes. Advance user tool.

[../_images/PIDReview_Icon.png](https://ardupilot.org/planner/_images/PIDReview_Icon.png)
