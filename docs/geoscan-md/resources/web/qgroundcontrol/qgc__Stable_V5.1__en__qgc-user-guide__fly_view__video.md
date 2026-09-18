---
title: "Video | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/video.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "f1572729b83638f700bc075d4ce9f1e13f6cc4dfdf178377aa08dbf7da1e3aff"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Video | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/video.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="video"></a>

# Video

When video streaming is enabled (Application Settings - Video), *QGroundControl* will display the video stream for the currently selected vehicle in the "video switcher window" at the bottom left of the map. You can press the switcher anywhere to toggle *Video* and *Map* to foreground.

INFO

Video streaming is configured/enabled in [Application Settings \> General tab \> Video](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html#video).

You can further configure video display using controls on the switcher:

- Resize the switcher by dragging the icon in the top right corner.
- Hide the switcher by pressing the toggle icon in the lower left.
- Detach the video switcher window by pressing on the icon in its top left corner (once detached, you can move and resize the window just like any other in your OS). If you close the detached window the switcher will re-lock to the QGC Fly view.

<a id="record-video"></a>

### Record Video

If supported by the camera and vehicle, *QGroundControl* can start and stop video recording on the camera itself. *QGroundControl* can also record the video stream and save it locally.

TIP

Video stored on the camera may be of much higher quality, but it is likely that your ground station will have a much larger recording capacity.

<a id="record-video-stream-on-gcs"></a>

#### Record Video Stream (on GCS)

Video stream recording is controlled on the [video stream instrument page](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#video_instrument_page). Press the red circle to start recording a new video (a new video file is created each time the circle is pressed); the circle will change into a red square while recording is in progress.

Video stream recording is configured in the [Application Settings \> General tab](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html):

- [Video Recording](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html#video-recording) - specifies the recording file format and storage limits.

  INFO

  Videos are saved in Matroska format (.mkv) by default. This format is relatively robust against corruption in case of errors.
- [Miscellaneous](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html#miscellaneous) - Streamed video is saved under the **Application Load/Save Path**.

TIP

The stored video includes just the video stream itself. To record video with QGroundControl application elements displayed, you should use separate screen recording software.

<a id="record-video-on-camera"></a>

#### Record Video on Camera

Start/stop video recording *on the camera itself* using the [camera instrument page](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/hud.html#camera_instrument_page). First toggle to video mode, then select the red button to start recording.
