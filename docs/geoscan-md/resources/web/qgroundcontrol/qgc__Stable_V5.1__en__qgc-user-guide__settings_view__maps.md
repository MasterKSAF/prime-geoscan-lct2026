---
title: "Maps | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/maps.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "db3784a571b21a563bc0ef748725a3ef67f0faecf631d1e767d6f5c2a0b0a87e"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Maps | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/maps.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="maps"></a>

# Maps

Centralized map configuration — provider selection, offline tile management, API tokens, custom tile servers, and cache settings.

<a id="map-provider"></a>

## Map Provider

- **Provider** — select the map tile provider (e.g., Bing, Google, Stamen, Mapbox, Esri, Eniro, VWorld)
- **Type** — map type for the selected provider (e.g., Hybrid, Satellite, Street, Terrain)
- **Elevation Provider** — source for terrain elevation data (e.g., Copernicus)

<a id="offline-maps"></a>

## Offline Maps

Download map tiles for use without an internet connection. You can create multiple tile sets for different locations.

- **Add New Set** — opens a full-screen map where you drag to the area of interest, set the name and zoom range, then click **Download** to cache the tiles
- **Tile set list** — shows all downloaded tile sets with name, tile count, size, and status
- **Import** — load a previously exported tile set file (append to or replace existing tiles)
- **Export** — save selected tile sets to a file for transfer to another device

<a id="tokens"></a>

## Tokens

API tokens for accessing additional map providers:

- **TianDiTu** — token for TianDiTu maps
- **Mapbox** — access token for Mapbox
- **Esri** — token for Esri/ArcGIS maps
- **VWorld** — token for VWorld maps (South Korea)
- **OpenAIP** — token for OpenAIP aeronautical data

<a id="mapbox-login"></a>

## Mapbox Login

Required when using Mapbox as the map provider:

- **Account** — Mapbox account name
- **Map Style** — custom Mapbox style URL

<a id="custom-map-url"></a>

## Custom Map URL

Configure a custom tile server using a URL template with `{x}`, `{y}`, and `{z}` (or `{zoom}`) substitutions:

- **Server URL** — tile server URL template (e.g., `https://tiles.example.com/{z}/{x}/{y}.png`)

<a id="tile-cache"></a>

## Tile Cache

- **Max disk cache** — maximum disk space for cached map tiles (default: 1024 MB, range: 1–262144 MB)
- **Max memory cache** — maximum RAM for in-memory tile cache (default: 128 MB desktop / 16 MB mobile, range: 1–1024 MB). Changes require a restart.
