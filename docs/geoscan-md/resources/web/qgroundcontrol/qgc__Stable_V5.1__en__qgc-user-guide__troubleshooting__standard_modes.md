---
title: "Standard Modes / External Flight Mode failures | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/standard_modes.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "7dd0e8150141700a1bed6a0510ce51f044ca575fb72aa5471679456120485bdf"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Standard Modes / External Flight Mode failures | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/standard_modes.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="standard-modes-external-flight-mode-failures"></a>

# Standard Modes / External Flight Mode failures

Standard Modes is a [MAVLink microservice](https://mavlink.io/en/services/standard_modes.html) through which supporting firmware (including PX4 and ArduPilot) advertises its flight modes to *QGroundControl* during the initial connection, using the `AVAILABLE_MODES`, `AVAILABLE_MODES_MONITOR` and `CURRENT_MODE` messages. This includes externally-registered flight modes.

If an expected flight mode does not appear in the flight-mode selector (or the wrong mode name is shown), the information needed to debug the problem is *QGroundControl's* internal processing of these messages. A MAVLink traffic capture alone is not sufficient, since it does not show how *QGroundControl* processed the messages.

<a id="capturing-a-standard-modes-log"></a>

## Capturing a Standard Modes log

1. Open **Application Settings \> App Log Viewer** and click **Categories**.
2. Enable the `Vehicle.StandardModes` logging category.
3. Reproduce the problem: connect the vehicle (with any external modes already registered) and wait for the connection sequence to complete.
4. Back in the App Log Viewer, click **Save** to save the application log to a file.

The log shows each `AVAILABLE_MODES` mode as it is received (name, index, standard mode, custom mode, and flags), when mode retrieval completes, and any request failures or re-requests triggered by `AVAILABLE_MODES_MONITOR` changes.

<a id="reporting-an-issue"></a>

## Reporting an issue

When [reporting an issue](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/support/support.html), attach the saved *QGroundControl* app log captured as described above. A MAVLink capture may be attached in addition, but is not a substitute for the app log.
