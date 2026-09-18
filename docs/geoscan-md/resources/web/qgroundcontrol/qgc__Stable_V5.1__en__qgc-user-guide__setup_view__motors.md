---
title: "Motor Setup | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/motors.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "84a9fc2d2466083ff844c7febe9390e12fe1258fd85be17773196e7c8b8d2a71"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Motor Setup | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/motors.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="motor-setup"></a>

# Motor Setup

Motor Setup is used to test individual motors/servos (for example, to verify that motors spin in the correct direction).

TIP

These instructions apply to PX4 and to most vehicle types on ArduPilot. Vehicle-specific instructions are provided as sub-topics (e.g. [Motors Setup (ArduSub)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/motors_ardusub.html)).

<a id="test-steps"></a>

## Test Steps

To test the motors:

1. Remove all propellers.

   WARNING

   You must remove props before activating the motors!
2. (*PX4-only*) Enable safety switch - if used.
3. Slide the switch to enable motor slider and buttons (labeled: *Propellers are removed - Enable slider and motors*).
4. Adjust the slider to select the power for the motors.
5. Press the button corresponding to the motor and confirm it spin in the correct direction.

   INFO

   The motors will automatically stop spinning after 3 seconds. You can also stop the motor by pressing the 'Stop' button. If no motors turn, raise the “Throttle %” and try again.

<a id="additional-information"></a>

## Additional Information

- [Basic Configuration \> Motor Setup](http://docs.px4.io/main/en/config/motors.html) (*PX4 User Guide*) - This contains additional PX4-specific information.
- [ESCS and Motors](https://ardupilot.org/copter/docs/connect-escs-and-motors.html#motor-order-diagrams) - This is the Motor order diagrams for all frames
