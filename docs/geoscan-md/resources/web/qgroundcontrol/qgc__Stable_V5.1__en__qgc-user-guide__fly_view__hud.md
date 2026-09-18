---
title: "Attitude / Compass | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "516ac7b2f4c26bf3a0ccdcc853d86647ff51ea539a5a0d1c3068221347238de1"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Attitude / Compass | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="attitude-compass"></a>

# Attitude / Compass

The attitude and compass widget is displayed in the Fly View and provides a real-time heads-up display of the vehicle's orientation.

<a id="attitude-indicator"></a>

## Attitude Indicator

The attitude indicator (artificial horizon) shows the vehicle's pitch and roll relative to the horizon:

- **Horizon line** — tilts and shifts to reflect the vehicle's current attitude
- **Pitch ladder** — graduated marks above and below the horizon showing pitch angle in degrees
- **Roll pointer** — arc along the top indicating the current roll angle

WARNING

The pitch display direction was corrected in V5.1: pitching nose-down now moves the pitch indicator down, matching the roll convention. V5.0 displayed pitch in the opposite (incorrect) direction.

The image below shows the integrated compass/attitude display for a vehicle rolling right and pitching down:

[Attitude indicator showing roll right and pitch down](https://docs.qgroundcontrol.com/Stable_V5.1/assets/attitude_roll_right_pitch_down.BX42vHUK.png)

<a id="compass"></a>

## Compass

The compass ring surrounds the attitude indicator and shows the vehicle's heading:

- **Heading value** — displayed at the top of the compass, showing the current heading in degrees
- **Cardinal directions** — N, S, E, W markers around the ring
- **Course indicator** — shows the direction of travel relative to heading

<a id="changing-the-display"></a>

## Changing the Display

You can choose from different attitude/compass display styles. Right-click (desktop) or touch-and-hold (tablet/phone) the widget to select an alternative.
