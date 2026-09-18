---
title: "Fly Tools | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "a1d4302d30cf0d6e5c143f8f5d8153b63477e515aaf188b358e832552402d291"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Fly Tools | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="fly-tools"></a>

# Fly Tools

<a id="confirmation"></a>

## Action Confirmation

Safety-critical actions (takeoff, land, RTL, etc.) require confirmation before they are executed. When you trigger one of these actions, a confirmation button appears with chevrons on its left side. To confirm, click and hold the button until the action is accepted. This prevents accidental activation of critical commands.

<a id="preflight_checklist"></a>

## Pre Flight Checklist

An automated preflight checklist can be used to run through standard checks that the vehicle is configured correctly and it is safe to fly.

To view the checklist, first enable the tool by navigating to [Application Settings \> General \> Fly View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html) and selecting the **Use preflight checklist** checkbox. The tool will then be added to the *Flight Tools*. Press it to open the checklist:

Once you have performed each test, select it on the UI to mark it as complete.

<a id="takeoff"></a>

## Takeoff

TIP

If you are starting a mission for a multicopter, *QGroundControl* will automatically perform the takeoff step.

To takeoff (when landed):

1. Press the **Takeoff** button in the *Fly Tools* (this will toggle to a **Land** button after taking off).
2. Optionally set the takeoff altitude in the right-side vertical slider.

- You can slide up/down to change the altitude
- You can also click on the specified altitude (10 ft in example) and then type in a specific altitude.

1. [Confirm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html#confirmation) the action.

<a id="land"></a>

## Land

You can land at the current position at any time while flying:

1. Press the **Land** button in the *Fly Tools* (this will toggle to a **Takeoff** button when landed).
2. [Confirm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html#confirmation) the action.

<a id="rtl-return"></a>

## RTL/Return

Return to a "safe point" at any time while flying:

1. Press the **RTL** button in the *Fly Tools*.
2. [Confirm](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_tools.html#confirmation) the action.

INFO

Vehicles commonly return to the "home" (takeoff) location and land. This behaviour depends on the vehicle type and configuration. For example, rally points or mission landings may be used as alternative return targets.

<a id="change_altitude"></a>

## Change Altitude

You can change altitude while flying, except when in a mission:

1. Press the **Actions** button on the *Fly Tools*
2. Select the *Change Altitude* button
3. Select the new altitude from the vertical slider
4. Confirm the action
