---
title: "Plan View - Pattern Presets | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/pattern_presets.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "f96dc09bd98f539ebb82eb47892ae6719110e265a79863e5f1026b217c926730"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Plan View - Pattern Presets | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/pattern_presets.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="plan-view-pattern-presets"></a>

# Plan View - Pattern Presets

Allows you to save commonly used settings as a named preset.

INFO

Currently only supported by Survey. Support for other Patterns is in development.

<a id="managing-presets"></a>

## Managing Presets

Pattern items have a new selection at the top which allows you to manage presets:

- **Custom (specify all settings)** This allows you to *not* use a preset and specify all settings manually.
- **Save Settings As Preset** Saves the current settings as a named preset.
- **Delete Current Preset** Deletes the currently selected preset.
- **Presets:** Below this item will be listed the available presets for this pattern.

<a id="creating-updating-a-preset"></a>

## Creating/Updating A Preset

When you select **Save Settings As Preset** you will be prompted for the preset name. To save new settings for an existing preset select **Save Settings As Preset** while a preset is currently selected.

You can also specify whether you want to save the currently selected camera in the preset. If you choose not to save the camera with the preset then the current camera will be used when loading the preset. You will also be able to change to a different camera when using the preset. Unless you fly your vehicle with different cameras at different times with the same preset you should select to save the camera in the preset.

<a id="viewing-preset-settings"></a>

## Viewing Preset Settings

If you want to view what the exact settings are for a Preset switch back to **Custom (specify all settings)** which will show you all the settings. Then you can switch back to using the named preset when done.

<a id="presets-in-a-plan-file"></a>

## Presets In A Plan File

The currently selected Preset is also saved in the Plan file such that when you load the Plan back the preset will once again be selected. Keep in mind that presets are specific to your version of QGroundControl. If you share a Plan file with a preset with another user, incorrect behavior may occur if that other user also has a preset of the same name but different settings.
