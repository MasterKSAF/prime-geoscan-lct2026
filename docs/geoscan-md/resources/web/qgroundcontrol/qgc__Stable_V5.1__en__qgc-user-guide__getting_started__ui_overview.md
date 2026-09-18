---
title: "UI Overview | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/getting_started/ui_overview.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "b91d6da9a42cc3de865f3ce60c7da1d5b08213716542dc189ec89806a7bc2e6c"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [UI Overview | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/getting_started/ui_overview.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="ui-overview"></a>

# UI Overview

QGroundControl is organized into a small number of top-level views, each accessed from the toolbar on the left side of the screen.

<a id="toolbar"></a>

## Toolbar

The toolbar is always visible and provides:

- **View switching** — click the **Q** icon in the toolbar to open the view selector, then choose Fly, Plan, or any other view.
- **View-specific content** — the rest of the toolbar changes based on the current view, showing relevant status and controls for that view.

<a id="main-views"></a>

## Main Views

<a id="fly-view"></a>

### Fly View

The primary view while your vehicle is in the air. It shows a live map with the vehicle position, a heads-up display (HUD) with attitude and speed, and an instrument panel with telemetry values. Action buttons let you arm, take off, land, return to launch, and more.

See: [Fly View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view.html)

<a id="plan-view"></a>

### Plan View

Used before flight to create and upload autonomous missions. You can place waypoints on the map, configure survey patterns, set geofence boundaries, and define rally points. Missions are uploaded to the vehicle over the active link.

See: [Plan View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html)

<a id="vehicle-configuration"></a>

### Vehicle Configuration

Configure your vehicle's firmware, airframe, sensors, flight modes, and safety settings. This view walks you through each setup step with a sidebar checklist. Available options vary depending on the connected firmware (PX4 or ArduPilot).

See: [Vehicle Setup](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/firmware.html)

<a id="analyze-view"></a>

### Analyze View

Tools for post-flight analysis and debugging:

- **Log Download** — retrieve onboard flight logs.
- **GeoTag Images** — stamp survey photos with GPS coordinates.
- **MAVLink Console** — send commands directly to the autopilot.
- **MAVLink Inspector** — view raw MAVLink messages in real time.

See: [Analyze](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/)

<a id="application-settings"></a>

### Application Settings

Persistent application preferences organized by category — general behavior, fly view layout, map providers, video streaming, RTK/NTRIP, telemetry logging, and more.
