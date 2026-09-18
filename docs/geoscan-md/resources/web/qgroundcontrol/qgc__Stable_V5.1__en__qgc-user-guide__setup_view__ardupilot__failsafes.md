---
title: "Failsafes (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/failsafes.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "24d563f9d4f7816305bd082d4c9e099dd4fc70a1beaf90658c2fb2ae3a2be4b2"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Failsafes (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/failsafes.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="failsafes-ardupilot"></a>

# Failsafes (ArduPilot)

The Failsafes page configures automatic safety actions that trigger when critical systems fail. The available failsafe options vary by vehicle type.

<a id="battery-failsafe"></a>

## Battery Failsafe

Configurable per battery (if multiple batteries are present):

- **Low battery action** — what to do when the battery reaches low level (RTL / Land / SmartRTL / etc.)
- **Critical battery action** — what to do when the battery reaches critical level
- **Low/Critical voltage thresholds** — voltage levels that trigger each action
- **Low/Critical capacity thresholds** — remaining mAh levels that trigger each action

<a id="ground-station-failsafe"></a>

## Ground Station Failsafe

- **GCS failsafe enable** — action when GCS heartbeat is lost
- **GCS timeout** — time without heartbeat before triggering (Copter/Rover)
- **Trigger method** — Heartbeat only / Heartbeat + RSSI / Heartbeat + AUTO mode (Plane)

<a id="throttle-failsafe"></a>

## Throttle Failsafe

- **Throttle failsafe enable** — action when RC throttle signal is lost
- **Throttle failsafe value** — PWM value that indicates signal loss
- Additional options vary by vehicle type (short/long action timeouts for Plane, etc.)

<a id="ekf-failsafe"></a>

## EKF Failsafe

- **EKF failsafe action** — action when the EKF position/velocity estimate becomes unreliable (Land / AltHold / Hold)
- **EKF variance threshold** — EKF variance level that triggers the failsafe

<a id="other-failsafes"></a>

## Other Failsafes

Depending on vehicle type, additional failsafes may include:

- **Dead Reckoning** (Copter) — action and timeout when GPS is lost
- **Crash Check** — detect and respond to crashes
- **Vibration** — detect excessive vibration
- **Leak Detection** (Submarine) — pin and logic level for leak sensors
- **Internal Temperature / Pressure** (Submarine) — environmental limits
