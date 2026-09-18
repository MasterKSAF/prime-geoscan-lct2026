---
title: "Camera Tools | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/camera_tools.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "65a65121f1f59616959a5d813e691f7c997b08ca43ed92527edbea80a69749ff"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Camera Tools | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/camera_tools.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="camera-tools"></a>

# Camera Tools

The camera tools are used to capture still images and video, and to configure the camera.

The camera capture and configuration options depend on the connected camera. The configuration options are selected using the panel gear icon. The configuration for a simple autopilot-connected camera are shown below.

When connected to camera that supports the [MAVLink Camera Protocol](https://mavlink.io/en/services/camera.html) you can additionally configure and use other camera services that it makes available. For example, if your camera supports video mode you will be able to switch between still image capture and video mode, and start/stop recording.

INFO

Most of the settings that are displayed depend on the camera (they are defined in its [MAVLink Camera Definition File](https://mavlink.io/en/services/camera_def.html)).

> A few common settings at the end are hard-coded: Photo Mode (Single/Time Lapse), Photo Interval (if Time Lapse), Reset Camera Defaults (sends a reset command to the camera), Format (storage) :::

<a id="video_instrument_page"></a>

### Video Stream

The video page is used to enable/disable video streaming. When enabled, you can start/stop the video stream, enable a grid overlay, change how the image fits the screen, and record the video locally with QGC.
