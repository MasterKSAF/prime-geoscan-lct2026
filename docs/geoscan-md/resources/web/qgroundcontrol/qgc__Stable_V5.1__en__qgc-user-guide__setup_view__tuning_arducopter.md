---
title: "ArduCopter Tuning | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/tuning_arducopter.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "ba8c8454bb987ac59ae8ffcf68c13d9268ad8deb05dfe0caec39762a31c46c2a"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [ArduCopter Tuning | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/tuning_arducopter.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="arducopter-tuning"></a>

# ArduCopter Tuning

<a id="basic-tuning"></a>

## Basic Tuning

Adjust the flight characteristics by moving the desired slider to the left or right.

<a id="autotune"></a>

## AutoTune

AutoTune is used to automatically tune the rate parameters in order to provide the highest response without significant overshoot.

Performing an AutoTune:

- Select which axes you would like to tune.

  TIP

  Tuning all axes at once can take a significant amount of time, which may cause you to run out of battery. To prevent this choose to tune only one axis at a time.
- Assign AutoTune to one of your transmitter switches. Ensure that switch is in low position before taking off.
- Take off and put the copter into AltHold.
- Turn on AutoTune with your transmitter switch.
- The copter will twitch around the specified axes for a few minutes.
- When AutoTune completes the copter will change back to the original settings.
- Move the AutoTune switch back to low position and then back to high to test the new settings.
- Move the AutoTune switch to low to test previous settings.
- To save new settings, land and disarm while AutoTune switch is in high position.

Note:

- Since AutoTune is done in AltHold your copter must already have a tuning which is minimally flyable in AltHold. You can cancel AutoTune at any time by moving the AutoTune switch back to low position.
- You can reposition the copter using your transmitter at any time during AutoTune.

<a id="in-flight-tuning"></a>

### In-Flight Tuning

This is an advanced option which allows you to tune a flight control parameter using one of your transmitter dial channels. Select the control option from the dropdown and specify the min/max for the values to assign to the dial.
