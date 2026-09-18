---
title: "Vehicle-Specific Setup (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/vehicle_specific.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "c7c32ec8f2244152422227254e7ecc2f2f3e794bdab62bda454ec794c5c09a34"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Vehicle-Specific Setup (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/ardupilot/vehicle_specific.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="vehicle-specific-setup-ardupilot"></a>

# Vehicle-Specific Setup (ArduPilot)

Some ArduPilot vehicle types display additional configuration pages that are only relevant to that vehicle class.

<a id="helicopter"></a>

## Helicopter

Available on traditional helicopter frames (ArduPilot 4.0+):

- **Swashplate** — servo manual mode, swashplate type, collective direction, linearize servo, flybar mode, cyclic max, collective min/max/angles, zero-thrust collective, landing collective minimum
- **Rotor Speed Control (RSC)** — RSC mode, critical rotor speed, ramp/runup/cooldown times, setpoint, idle percentage, throttle curve (0/25/50/75/100%), governor settings (reference/range/RPM/torque/FF)

<a id="submarine"></a>

## Submarine

Available on ArduSub frames (ArduPilot 3.5+):

- **Sub Frame** — select the submarine frame configuration (BlueROV1, BlueROV2/Vectored, Vectored-6DOF, etc.) with a visual frame selector. Option to load vehicle default parameters after selection.
- **Lights** — configure light output channel assignments (`SERVOn_FUNCTION`), step size (`JS_LIGHTS_STEP`), and number of brightness steps (`JS_LIGHTS_STEPS`)

<a id="fixed-wing"></a>

## Fixed Wing

Fixed-wing vehicles may show additional pages for airspeed sensor calibration when an airspeed sensor is detected.
