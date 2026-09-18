---
title: "Logging (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/logging_ardupilot.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "54be0d21087b32f6a54b62ed7a452662a2470d1ce2e60d8da860e19ea6deadf8"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Logging (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/logging_ardupilot.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="logging-ardupilot"></a>

# Logging (ArduPilot)

The *Logging* setup page (**Vehicle Config \> Logging**) is available for ArduPilot vehicles and allows you to configure how and what the flight controller logs.

<a id="parameters"></a>

## Parameters

All parameters are optional — controls for parameters not supported by the connected firmware are hidden automatically.

<a id="storage"></a>

### Storage

| Parameter | Description |
| --- | --- |
| `LOG_BACKEND_TYPE` | Which backends are active: SD card file, MAVLink stream, and/or onboard flash (bitmask). |
| `LOG_BITMASK` | Which data groups are included in the log (bitmask). |
| `LOG_MAX_FILES` | Maximum number of log files retained before the oldest is rotated out. |
| `LOG_FILE_MB_FREE` | Minimum free SD card space (MB) that must remain available before logging begins. |

<a id="rate-limits"></a>

### Rate Limits

| Parameter | Description |
| --- | --- |
| `LOG_FILE_RATEMAX` | Maximum file logging rate (Hz). Lower this if the SD card cannot keep up. |
| `LOG_BLK_RATEMAX` | Maximum block (onboard flash) logging rate (Hz). |
| `LOG_MAV_RATEMAX` | Maximum MAVLink log stream rate (Hz). |

<a id="options"></a>

### Options

| Parameter | Description |
| --- | --- |
| `LOG_DISARMED` | Enable logging while the vehicle is disarmed (useful for pre-arm diagnostics). |
| `LOG_FILE_DSRMROT` | Rotate the log file after each disarm/rearm sequence. |
| `LOG_REPLAY` | Log extra data needed for EKF replay analysis. |
| `EK3_LOG_LEVEL` | Controls EKF3 logging verbosity (0 = full, 3 = disabled). |
