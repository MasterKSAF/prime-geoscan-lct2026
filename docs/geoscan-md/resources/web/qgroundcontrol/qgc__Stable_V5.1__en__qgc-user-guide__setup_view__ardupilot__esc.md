---
title: "ESC Calibration (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/esc.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "3dcc78c6190aa25951e109cf1523ba1a655097c6a58104aad92c53bd0e640fe5"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [ESC Calibration (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/esc.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="esc-calibration-ardupilot"></a>

# ESC Calibration (ArduPilot)

The ESC page configures Electronic Speed Controller output parameters and provides ESC calibration for ArduPilot vehicles.

<a id="configuration"></a>

## Configuration

- **Output type** — PWM output protocol: Normal / OneShot / OneShot125 / DShot150/300/600/1200 (`MOT_PWM_TYPE`). For QuadPlane VTOL, uses `Q_M_PWM_TYPE`.
- **Output PWM min** — minimum PWM value sent to ESCs (`MOT_PWM_MIN`)
- **Output PWM max** — maximum PWM value sent to ESCs (`MOT_PWM_MAX`)
- **Spin when armed** — motor spin level when armed but not flying (`MOT_SPIN_ARM`)
- **Spin minimum** — minimum spin level during flight (`MOT_SPIN_MIN`)
- **Spin maximum** — maximum spin level (`MOT_SPIN_MAX`)

When a DShot output type is selected, additional settings appear:

- **DShot ESC type** — ESC protocol variant (`SERVO_DSHOT_ESC`)
- **DShot output rate** — DShot frame rate (`SERVO_DSHOT_RATE`)

<a id="calibration"></a>

## Calibration

WARNING

Remove all propellers before calibrating ESCs.

Press the **Calibrate** button to run the ESC calibration procedure. This sets `ESC_CALIBRATION = 3`, which triggers the ESC to learn the throttle range on the next reboot.
