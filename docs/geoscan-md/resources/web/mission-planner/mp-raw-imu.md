---
title: "Raw IMU Logging for FFT Analysis — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-raw-imu-logging.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "15e246853c0e1069cc3c3572034402dfd3a7df5d37348a8cb14c2c8323ef35e0"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Raw IMU Logging for FFT Analysis — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-raw-imu-logging.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="raw-imu-logging-for-fft-analysis"></a>

<a id="common-raw-imu-logging"></a>

# Raw IMU Logging for FFT Analysis

Using the [IMU Batch Sampler](https://ardupilot.org/planner/docs/common-imu-batchsampling.html#common-imu-batchsampling) to gather data for spectral analysis of noise to setup notch filtering is the historical method and still valid but with firmware 4.5 and later, and if using an H7-based autopilot, a simpler and better method is to enable Raw IMU Logging combined with the [Filter Review tool](https://firmware.ardupilot.org/Tools/WebTools/FilterReview/).

The downside to this method is that it produces very large logs and unless the data gathering is restricted to a single gyro, some slower autopilots (F4-based, for example), may not be able to keep up resulting in logging drop-outs. Also the data produced can only be analyzed by the [Filter Review tool](https://firmware.ardupilot.org/Tools/WebTools/FilterReview/) on the [ArduPilot Firmware “Web Tools” page](https://firmware.ardupilot.org/Tools/WebTools/).

Using this new method greatly simplifies the notch filtering setup. The required data can be gathered in a single test flight and the filters can then be setup interactively with the [Filter Review tool](https://firmware.ardupilot.org/Tools/WebTools/FilterReview/).

<a id="filter-setup-process"></a>

## Filter Setup Process

1. Select the method that will be used for dynamically adjusting the notch(s) center frequency and do any required setup, ie if [ESC telemetry](https://ardupilot.org/sub/docs/common-esc-telemetry.html#common-esc-telemetry) will be used make sure its setup, if Throttle based make sure your motor voltage compensation is setup (see `Q_M_BATT_x` params for QuadPlane or `MOT_BAT_x` params for Copter).
2. [INS\_RAW\_LOG\_OPT](https://ardupilot.org/sub/docs/parameters.html#ins-raw-log-opt): any bits set will enable raw IMU logging. To prevent overloading the logging, especially on slower autopilot CPUs, set [INS\_RAW\_LOG\_OPT](https://ardupilot.org/sub/docs/parameters.html#ins-raw-log-opt) bit 0 and bit 3 (value = “9”). This will restrict logging to the primary gyro and log both pre and post filtering.
3. <a id="common-raw-imu-logging-determination-flight"></a>

   Perform a regular flight (not just a gentle hover) of at least 30sec and [download the dataflash logs](https://ardupilot.org/planner/docs/common-downloading-and-analyzing-data-logs-in-mission-planner.html#common-downloading-and-analyzing-data-logs-in-mission-planner).
4. Using the [Filter Review tool](https://firmware.ardupilot.org/Tools/WebTools/FilterReview/) load the log. Select a steady hover portion of the log and press “Calculate”. Then you can enable one or both of the filters in the tool and experiment with the parameters(refer back to the [Managing Gyro Noise with the Dynamic Harmonic Notch Filters](https://ardupilot.org/plane/docs/common-imu-notch-filtering.html#common-imu-notch-filtering) page for details of what each parameter means) to get the lowest noise in the estimated post-filter spectrum, especially in the lower frequencies of the control band (0-40Hz). Remember that each additional harmonic filter adds cpu computational load. Usually only two or three per filter will be sufficient.

Note

if the FilterReview tool complains that not enough data is in the log, this usually means that logging has not been able to keep up and has dropped some packets. Either reduce the FFT window size to 512 from 1024, or, preferably, try just clearing the pre and post logging option in [INS\_RAW\_LOG\_OPT](https://ardupilot.org/sub/docs/parameters.html#ins-raw-log-opt) and retry the test flight to log only the input noise and use the estimated post-filter trace to setup the filters.

1. Save those parameters and load them into the autopilot.
2. <a id="common-raw-imu-logging-post-configuration-flight"></a>

   Do another flight to confirm the filter setup. This this flight more normal flight maneuvers can be done.
3. Once verified, clear the [INS\_RAW\_LOG\_OPT](https://ardupilot.org/sub/docs/parameters.html#ins-raw-log-opt) parameter to avoid large logs from being saved unnecessarily.
