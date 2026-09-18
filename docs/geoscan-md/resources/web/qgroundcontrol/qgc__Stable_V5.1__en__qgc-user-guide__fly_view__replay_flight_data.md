---
title: "Replay Flight Data | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/replay_flight_data.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "c25addd7c88ce0ad7ec374aabe62d2ae7225acf582b80c2da2fc85cbc1fe8c24"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Replay Flight Data | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/replay_flight_data.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="replay-flight-data"></a>

# Replay Flight Data

WARNING

This feature is intended primarily for **autopilot developers**/**vehicle creators**. It is only supported on desktop builds (Windows, Linux, Mac OS).

The *Replay Flight Data* feature allows users to replay a telemetry log, enabling review of past or problematic flights. The flight can be started, paused, stopped, restarted etc.

INFO

*QGroundControl* treats flight replay like an active connection. When you pause/stop playing, the ground station will report "Communication Lost" and wait for disconnection or for more messages.

To replay a flight:

1. Disconnect any active connections.
2. Select **Application Settings \> General \> Fly View**
3. Check **Show Telemetry Log Replay Status Bar** to toggle the flight replay bar at the bottom of the screen.
4. Select the **Load Telemetry Log** button in the bar to display a *file selection* dialog.

   - Choose a log file to replay from the available telemetry logs.
   - *QGroundControl* will immediately start playing the log.
5. When a log is loaded you can use the:

   - **Pause/Play** button to pause and restart playing.
   - *Slider* to drag to a new position in the log.
   - *Rate* selector to choose the playback speed.
6. To stop replay (i.e. to load a new file to replay), first pause the flight, and then select **Disconnect** (when it appears). After disconnecting, the **Load Telemetry Log** button will be displayed.

TIP

You can inspect the running replay in more detail using the [MAVLink Inspector](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/mavlink_inspector.html).
