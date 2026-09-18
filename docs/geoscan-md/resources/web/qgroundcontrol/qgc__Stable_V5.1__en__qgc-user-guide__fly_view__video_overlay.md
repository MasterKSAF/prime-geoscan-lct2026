---
title: "Video Overlay | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/video_overlay.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "80f972fc9c6568df735d5c269b17d74ca005500e203da2c54654386645fc1479"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Video Overlay | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/video_overlay.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="video-overlay"></a>

# Video Overlay

When QGroundControl is recording a video stream to a file, it will also export a subtitle file with telemetry data that can be used to overlay the telemetry on the video during playback. Whichever telemetry values are selected for display in the telemetry [values widget](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#instrument_panel) will also be exported to the overlay. The overlay values are updated at 1Hz.

The selected values are laid out in three columns to optimize the screen utilization.

<a id="playing"></a>

## Playing

The overlay can be used with any player that [supports the SubStation Alpha](https://en.wikipedia.org/wiki/SubStation_Alpha#Players_and_renderers) subtitle format. Most players will open both files together when you try to play the video. They need to be in the same folder and with the same name, which is how they are created by QGC.

<a id="permanent-video-subtitles-using-handbrake"></a>

## Permanent Video Subtitles using Handbrake

Subtitles can be permanently added to a video file using [HandBrake](https://handbrake.fr/). This will make the subtitles permanently visible on any video player.

Open **HandBrake**, you should see its main interface. Click **Open** and select the video file.

With the video file loaded, switch to the subtitles tab. Click **Add** to load the subtitle file.

Choose **import SSA** ([ASS](https://en.wikipedia.org/wiki/SubStation_Alpha#Advanced_SubStation_Alpha) is an extension of SSA).

Load the **.ass** file corresponding to your video and tick the **Burn into video** checkbox.

Choose where you want to save the new file and click **Start**.

This will start burning the subtitle and video to a new file.
