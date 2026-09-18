---
title: "Airframe Setup (ArduPilot) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/airframe_ardupilot.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "b4ed3c0aa3a1d41e174b153d298c1c9d458d2808edbef8ba60953b94aa23308d"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Airframe Setup (ArduPilot) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/airframe_ardupilot.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="airframe-setup-ardupilot"></a>

# Airframe Setup (ArduPilot)

Airframe Setup is used to select the frame class and type that matches your vehicle

INFO

Airframe Setup is only available on *ArduCopter* and *ArduSub* vehicles (it is not shown for *ArduPilot* Rover or Plane vehicles).

<a id="arducopter-airframe-setup"></a>

## ArduCopter Airframe Setup

To select the airframe in Copter:

1. First select the **Gear** icon (Vehicle Setup) in the top toolbar and then **Airframe** in the sidebar.
2. Select the broad *Frame Class* for your vehicle:

   INFO

   You will need to reboot the vehicle for class changes to take effect.
3. Select the specific *Frame Type* for your vehicle:

<a id="ardusub"></a>

## ArduSub Frame Setup

To select the frame type for Sub:

1. First select the **Gear** icon (Vehicle Setup) in the top toolbar and then **Frame** in the sidebar.
2. Select the frame type that matches your vehicle (selecting a frame applies the selection).
3. Make sure that all **green** thrusters have **clockwise** propellers and all **blue** thrusters have **counter-clockwise** propellers (or vice-versa).

   - You can also click **Load Vehicle Default Parameters** to load default parameter set for ArduSub.
