---
title: "Servo Outputs (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/servo_outputs.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "8989ba7dc0e35cc40e160116552aa3d476145ef9e009944e83c9fc75b901ac4c"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Servo Outputs (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/servo_outputs.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="servo-outputs-ardupilot"></a>

# Servo Outputs (ArduPilot)

The Servo Outputs page provides real-time visualization and configuration for up to 16 servo/motor output channels.

<a id="per-channel-controls"></a>

## Per-Channel Controls

Each servo channel (if its `SERVOn_FUNCTION` parameter exists) displays:

| Column | Description | Parameter |
| --- | --- | --- |
| **#** | Servo number (1–16) | — |
| **Position** | Live PWM value shown as a progress bar with numeric readout | (read-only telemetry) |
| **Function** | Output function assignment (e.g., Motor1, Aileron, Throttle, etc.) | `SERVOn_FUNCTION` |
| **Min** | Minimum PWM output (adjustable with +/− buttons) | `SERVOn_MIN` |
| **Trim** | Neutral/center PWM value (adjustable with +/− buttons) | `SERVOn_TRIM` |
| **Max** | Maximum PWM output (adjustable with +/− buttons) | `SERVOn_MAX` |
| **Reversed** | Reverse the output direction | `SERVOn_REVERSED` |

The live position bars update in real time from the vehicle's servo output telemetry, allowing you to verify that outputs respond correctly to control inputs.
