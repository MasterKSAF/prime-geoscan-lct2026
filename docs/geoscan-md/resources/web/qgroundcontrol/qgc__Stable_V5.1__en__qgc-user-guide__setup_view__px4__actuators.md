---
title: "Actuators / Motors (PX4) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/px4/actuators.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "c7ae9d82ad36f3652a9cf42d663b2a8fa5f85e685aa0b2db6d12d7eb97764a4a"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Actuators / Motors (PX4) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/px4/actuators.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="actuators-motors-px4"></a>

# Actuators / Motors (PX4)

The Actuators page provides a unified interface for configuring motor and servo outputs on PX4 vehicles (PX4 v1.13+).

<a id="geometry-mixer"></a>

## Geometry / Mixer

The top section displays the vehicle's actuator geometry, dynamically generated from the mixer configuration. For multirotor vehicles, an SVG diagram shows motor positions — you can click individual motors to select them. Each actuator channel has configurable parameters such as position offsets and tilt angles.

<a id="actuator-outputs"></a>

## Actuator Outputs

The right panel shows all output channels with:

- **Function** — assign each output to a motor, servo, or other function
- **Min / Max** — PWM or DShot output range limits
- **Failsafe** — output value when failsafe is triggered
- **Disarmed** — output value when the vehicle is disarmed

<a id="actuator-testing"></a>

## Actuator Testing

WARNING

Remove all propellers before testing actuators.

With the safety switch toggled, individual actuator sliders appear for testing each channel. An optional **All Motors** slider allows spinning all motors simultaneously at low throttle for verification.

<a id="actuator-actions"></a>

## Actuator Actions

Dynamic action buttons (e.g., beep, identify, 3D mode) are shown based on the vehicle's actuator configuration. The **motor identification** feature spins motors one at a time to verify correct wiring and rotation direction.

<a id="troubleshooting-a-missing-actuators-page"></a>

## Troubleshooting a Missing Actuators Page

If the Actuators page does not appear (the legacy Motors page is shown instead), see [Missing Actuators Page](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/actuators.html).
