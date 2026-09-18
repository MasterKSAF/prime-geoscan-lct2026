---
title: "PX4 Log Transfer | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/px4_log_transfer.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "66535964c9b25a171908f13643b986bca88eaaa790639c3f15bb0bc988e57ce7"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [PX4 Log Transfer | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/px4_log_transfer.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="px4-log-transfer"></a>

# PX4 Log Transfer

INFO

This page is only available when connected to a PX4 vehicle.

Manage MAVLink 2.0 flight log recording, upload, and local storage.

<a id="log-control"></a>

## Log Control

- **Start/Stop Logging** — manually start or stop MAVLink 2.0 log recording
- **Enable automatic logging** — automatically begin logging when a vehicle connects

<a id="upload-settings"></a>

## Upload Settings

Configure automatic upload of flight logs to [PX4 Flight Review](https://review.px4.io):

- **Email address** — required for log upload
- **Default Description** — text description attached to uploaded logs
- **Default Upload URL** — Flight Review server URL
- **Video URL** — link to video of the flight
- **Wind Speed** — ambient conditions (Calm / Breeze / Gale / Storm)
- **Flight Rating** — pilot assessment (Crashed / Unsatisfactory / Good / Great)
- **Additional Feedback** — free-text notes
- **Make this log publicly available** — share uploaded logs publicly
- **Enable automatic log uploads** — upload logs automatically after download

<a id="log-files"></a>

## Log Files

List of saved log files with:

- Checkbox selection (Check All / Check None)
- File name and size
- Upload progress indicator
- **Delete Selected** / **Upload Selected** / **Cancel** buttons
