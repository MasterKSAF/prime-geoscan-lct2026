---
title: "Font and Palette | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/user_interface_design/font_palette.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "91ef86a0d3ba208d30bd69fa117f72809e1f97f3d20dd971734bb28d68d6264a"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Font and Palette | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/user_interface_design/font_palette.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="font-and-palette"></a>

# Font and Palette

QGC has a standard set of fonts and color palette which should be used by all user interface.

```text
import QGroundControl.Controls
```

<a id="qgcpalette"></a>

## QGCPalette

This item exposes the QGC color palette. There are two variants of this palette: light and dark. The light palette is meant for outdoor use and the dark palette is for indoor. Normally you should never specify a color directly for UI, you should always use one from the palette. If you don't follow this rule, the user interface you create will not be capable of changing from a light/dark style.

<a id="qgcmappalette"></a>

## QGCMapPalette

The map palette is used for colors which are used to draw over a map. Due to the the different map styles, specifically satellite and street you need to have different colors to draw over them legibly. Satellite maps needs lighter colors to be seen whereas street maps need darker colors to be seen. The `QGCMapPalette` item provides a set of colors for this as well as the ability to switch between light and dark colors over maps.

<a id="screentools"></a>

## ScreenTools

The ScreenTools item provides values which you can use to specify font sizing. It also provides information on screen size and whether QGC is running on a mobile device.
