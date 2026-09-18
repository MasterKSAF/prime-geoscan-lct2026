---
title: "Support | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/support/support.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "371bef9cb08ea764807354ecc94d35326de4d73ffc7ffd1c8a27ea614f79de39"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Support | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/support/support.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="support"></a>

# Support

This user guide is meant to be the main provider of support for *QGroundControl*. If you find incorrect or missing information please report an [Issue](https://github.com/mavlink/qgc-user-guide/issues).

*Questions* about how to use *QGroundControl* should be raised in the discussion forum for the associated flight stack:

- [PX4 Pro Flight Stack](http://discuss.px4.io/c/qgroundcontrol/qgroundcontrol-usage) (discuss.px4.io).
- [ArduPilot Flight Stack](http://discuss.ardupilot.org/c/ground-control-software/qgroundcontrol) (discuss.ardupilot.org).

These forums are completely self-help from other QGC users.

<a id="developer_chat"></a>

## Developer Chat

*QGroundControl* developers (and many regular/deeply-involved users) can be found on the [#QGroundControl channel on the Dronecode Discord](https://discord.gg/dronecode).

<a id="github-issues"></a>

## GitHub Issues

Issues are used to track bugs against *QGroundControl* as well as feature requests for later versions. The current list of issues can be found on [GitHub here](https://github.com/mavlink/qgroundcontrol/issues).

INFO

Please contact our developers using the support forums **before** creating GitHub issues for either bugs or feature requests.

<a id="reporting-bugs"></a>

### Reporting Bugs

If you are directed to create an issue, please use the "Bug report" template and provide all information specified in the template.

<a id="reporting-crashes-from-windows-builds"></a>

#### Reporting Crashes from Windows Builds

When QGC crashes a crash dump file will be place in the Users LocalAppData directory. To navigate to that directory use the Start/Run command. You can bring this up window WinKey+R. Type into that `%localappdata%` for Open and click Ok. Crash dumps will be in a `QGCCrashDumps` folder in that directory. You should find a new **.dmp** file there. Add a link to that file in a GitHub Issue when reporting you problem.

<a id="reporting-hangs-from-windows-builds"></a>

#### Reporting Hangs from Windows Builds

If Windows is telling you the *QGroundControl program is unresponsive* use the following steps to report the hang:

1. Open *Task Manager* (right-click TaskBar, select **Task Manager**)
2. Switch to the Processes tab and local **qgroundcontrol.exe**
3. Right-click on **groundcontrol.exe** and select **Create Dump File**
4. Place the dump file in a public location
5. Add a link to the **.dmp** file and above details in the GitHub issue.

<a id="feature-requests"></a>

### Feature Requests

If you are directed to create a feature request after discussion on support forums please use the "Feature request" template which has some helpful information on required details.

<a id="troubleshooting"></a>

## Troubleshooting

Troubleshooting information is available in the [Troubleshooting section](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/).

<a id="console-logging"></a>

### Console Logging

*Console Logs* can be helpful when diagnosing *QGroundControl* problems. For more information see: [Console Logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html).

<a id="help-improve-these-docs"></a>

## Help Improve these Docs

Just like *QGroundControl* itself, the user guide is an open source, user created and supported GitBook. We welcome [Pull Requests](https://github.com/mavlink/qgc-user-guide/pulls) against the guide for fixes and/or updates.
