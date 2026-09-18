---
title: "Resume Mission Failures | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/resume_mission.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "f9818801d1e8ec907bc287e9892a9bbf02a72bb7b21bfddb61dc4123fab45b23"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Resume Mission Failures | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/resume_mission.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="resume-mission-failures"></a>

# Resume Mission Failures

The process of resuming a mission after a battery swap is a fairly complex process within QGC.

The two main areas that are most problematic are:

- The *Resume Mission* dialog doesn't display when it should and you are just left with a Start Mission slider.
- The new mission generated from *Resume Mission* is not quite correct with respect to recreation of waypoints and/or camera commands.

WARNING

In order for the *QGroundControl* development team to debug these issues the following information **must be supplied** in any github issue entered against *Resume Mission*.

<a id="common_steps"></a>

## Common Steps for Resume Mission Dialog/Generation

The following steps are required for debugging both types of problems:

1. Restart QGC
2. Turn on [console logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html) with the logging category: `QMLControls.GuidedActionsController`.
3. Enable [telemetry logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html#miscellaneous) (**Settings \> General**).
4. Start the mission.
5. Fly till you need a battery swap.

   TIP

   Alternatively you can attempt to reproduce the problem by manually RTL from the middle of the middle of the mission (though this may not always reproduce the problem).
6. Once the vehicle lands and disarms you should get the *Resume Mission* dialog.

   INFO

   If not there is a possible bug in QGC.

<a id="resume-mission-dialog-problems"></a>

### Resume Mission Dialog Problems

For *Resume Mission Dialog* problems follow the [common steps above](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/resume_mission.html#common_steps), and then:

1. Save the *App Log* to a file.
2. Place the *App Log*, *Telemetry Log* and *Plan File* someplace which you can link to in the issue.
3. Create the issue with details and links to all three files.

<a id="resume-mission-generation-problems"></a>

## Resume Mission Generation Problems

For *Resume Mission Generation* problems follow the [common steps above](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/resume_mission.html#common_steps), and then:

1. Click **Resume Mission**.
2. The new mission should be generated.
3. Go to [Plan View](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html).
4. Select **Download** from the *File/Sync* menu.
5. Save the *Modified Plan* to a file.
6. Save the *App Log* to a file.
7. Place the *App Log*, *Telemetry Log*, *Original Plan* file and *Modified Plan* file someplace which you can link to in the issue.
8. Create the issue with details and links to all four files.
