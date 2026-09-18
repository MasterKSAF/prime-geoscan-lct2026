---
title: "Remote ID | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/remote_id.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "28399fcf014f56cd84cb893edd6840efe8515e719a14b1890ac98d2872b70773"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Remote ID | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/remote_id.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="remote-id"></a>

# Remote ID

Configure drone Remote ID broadcast settings to comply with FAA or EU regulations.

<a id="region"></a>

## Region

- **Region of operation** — FAA or EU (controls which fields are shown)

<a id="basic-id"></a>

## Basic ID

- **Broadcast** — enable Basic ID broadcasting
- **Basic ID Type** — None / Serial Number / CAA Registration / UTM (USS) Assigned / Specific Session
- **UA type** — aircraft type classification (Helicopter/Multirotor, Airplane, Gyroplane, VTOL, Airship, Glider, etc.)
- **Basic ID** — the identification string (max 20 characters)

<a id="operator-id"></a>

## Operator ID

- **Broadcast** — enable Operator ID broadcasting (FAA only)
- **Operator ID type** — CAA
- **Operator ID** — your operator registration number (max 20 characters)

<a id="self-id"></a>

## Self ID

- **Broadcast** — enable Self ID broadcasting
- **Broadcast Message** — Flight Purpose / Emergency / Extended Status
- **Flight Purpose** / **Extended Status** / **Emergency Text** — message strings (max 23 characters)

<a id="ground-station-location"></a>

## Ground Station Location

- **Location Type** — Takeoff (auto) / Live GNSS / Fixed coordinates
- **Latitude/Longitude/Altitude** — manual coordinates when using Fixed type

<a id="gcs-position"></a>

## GCS Position

Read-only display of current GCS latitude, longitude, and HDOP.

<a id="gps-location"></a>

## GPS Location

Configure an external NMEA GPS device for GCS position (device, baudrate, port selection).

<a id="eu-vehicle-info-eu-region-only"></a>

## EU Vehicle Info (EU region only)

- **Classification Type** — Undeclared / EU
- **Category** — Undeclared / Open / Specific / Certified
- **Class** — EU drone class designation
