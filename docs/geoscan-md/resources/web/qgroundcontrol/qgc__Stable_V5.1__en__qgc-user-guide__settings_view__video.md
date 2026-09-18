---
title: "Video | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/video.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "c5bd759d29aecc40e77fbc9fc044a6fdbeac2a54aa9086c752e07c2d79b0eb66"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Video | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/video.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="video"></a>

# Video

Configure video streaming and recording settings.

<a id="video-source"></a>

## Video Source

- **Source** — Video Stream Disabled / RTSP Video Stream / UDP h.264 / UDP h.265 / TCP-MPEG2 / MPEG-TS / Integrated Camera

<a id="connection"></a>

## Connection

Connection settings vary by source type:

- **RTSP URL** — full RTSP stream address
- **TCP URL** — TCP stream address
- **UDP URL** — UDP stream address and port (default: `0.0.0.0:5600`)

<a id="settings"></a>

## Settings

- **Aspect Ratio** — aspect ratio for scaling video in the display widget (default: 16:9; set to 0.0 to disable scaling)
- **Stop recording when disarmed** — automatically stop recording when the vehicle disarms
- **Low Latency Mode** — minimize video decode latency at the cost of some smoothness
- **Force CPU video path** — disable hardware-accelerated rendering (use if video displays incorrectly)
- **Force video decoder priority** — override the automatic decoder selection: Default / Software / Hardware / NVIDIA / VA-API / DirectX 3D11 / VideoToolbox / Intel / Vulkan

<a id="local-video-storage"></a>

## Local Video Storage

- **Record File Format** — mp4 / mov / mkv
- **Auto-Delete Saved Recordings** — automatically delete old recordings when storage limit is reached
- **Max Storage Usage** — maximum disk space for saved recordings (default: 10240 MB)
