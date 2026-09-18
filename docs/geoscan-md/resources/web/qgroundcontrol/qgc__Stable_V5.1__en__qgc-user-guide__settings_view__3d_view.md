---
title: "3D View Settings | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/3d_view.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "687565516963f05d1f686469b0da28cb1f96985f91addb2de5e5963924b3b449"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [3D View Settings | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/3d_view.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="_3d-view-settings"></a>

# 3D View Settings

WARNING

The entire 3D View feature is a work in progress. You may hit various issues while using it.

INFO

The 3D View is not available on Android, so these settings are hidden there.

Settings for the optional 3D map view in the Fly View.

<a id="general"></a>

## General

- **Enable the 3D viewer** — turn the 3D view on or off (disabled by default)
- **3D map data provider** — select the map data source (currently OpenStreetMap)

<a id="data"></a>

## Data

These settings are available when the 3D viewer is enabled:

- **Path to the OSM file** — local `.osm` file to use for 3D building and terrain data. If no file is loaded, buildings are not shown; the 3D view falls back to a map-tile ground patch centered on the vehicle's home position.
- **Average Height for each level of the buildings** — estimated floor height used to calculate building heights from level counts (default: 3 m, range: 0.5–20 m)
- **Altitude bias** — vertical offset applied to vehicles in the 3D view to correct for altitude datum differences (default: 0 m, range: -1000 to 1000 m)
