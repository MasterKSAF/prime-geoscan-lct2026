---
title: "ArduSub Tuning | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/tuning_ardusub.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "b04e0f2ea13fa728a68ce5df789f704295aed502623baac6d514f50df8de14bd"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [ArduSub Tuning | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/tuning_ardusub.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="ardusub-tuning"></a>

# ArduSub Tuning

<a id="basic-tuning"></a>

## Basic Tuning

This page allows changing the PID controller gains to better suit your vehicle and application. Changing these may help you get a snappier response for more precise movements, or a smoother response for recording cinematic footages. Adjust a parameter by moving the desired slider, or by clicking the increase/decrease buttons. There are three controllers that can be adjusted here:

- [**Attitude Controller Parameters**](https://www.ardusub.com/operators-manual/full-parameter-list.html#atc-parameters) are the parameters for the controller responsible for keeping the vehicle oriented as you want it, assuming your vehicle has ability (enough motors/DOF) to do so.
- **Position Controller Parameters** are the parameters for the controller responsible for positioning the vehicle at a point in 3D space. The **Z** parameters control how the depth control works (eg in [*Depth Hold*](https://www.ardusub.com/operators-manual/flight-modes.html#depth-hold) mode). The **XY** parameters affect how the vehicle controls the horizontal position in [*Position Enabled*](https://www.ardusub.com/operators-manual/flight-modes.html#position-enabled-modes) modes.
- **Waypoint Navigation Parameters** are the parameters for the controller responsible for following waypoints in **Auto** and **Guided** mode.

  WARNING

  **Guided** and **Auto** modes are currently unsupported and some features are disabled in QGC.
