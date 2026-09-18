---
title: "Command Line Options | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/command_line_options.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "e8aeea674bcb357d20dab45f4b9157087d0a27951be067d76ad2d32a9e44d1c0"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Command Line Options | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/command_line_options.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="command-line-options"></a>

# Command Line Options

You can start *QGroundControl* with command line options. These are used to enable logging, run unit tests, and simulate different host environments for testing.

<a id="starting-qgroundcontrol-with-options"></a>

## Starting QGroundControl with Options

You will need to open a command prompt or terminal, change directory to where **qgroundcontrol.exe** is stored, and then run it. This is shown below for each platform (using the `--logging:full` option):

Windows Command Prompt:

sh

```text
cd "\Program Files (x86)\qgroundcontrol"
qgroundcontrol --logging:full
```

OSX Terminal app (**Applications/Utilities**):

sh

```text
cd /Applications/qgroundcontrol.app/Contents/MacOS/
./qgroundcontrol --logging:full
```

Linux Terminal:

sh

```text
./qgroundcontrol-start.sh --logging:full
```

<a id="options"></a>

## Options

The options/command line arguments are listed in the table below.

| Option | Description |
| --- | --- |
| `--clear-settings` | Clears the app settings (reverts *QGroundControl* back to default settings). |
| `--logging:full` | Turns on full logging. See [Console Logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html#logging-from-the-command-line). |
| `--logging:full,Comms.LinkManager:verbose,FactSystem.ParameterManager` | Turns on full logging and turns off the following listed comma-separated logging categories. |
| `--logging:Comms.LinkManager,FactSystem.ParameterManager` | Turns on the specified comma separated logging categories. |
| `--unittest:name` | (Debug builds only) Runs the specified unit test. Leave off `:name` to run all tests. |
| `--unittest-stress:name` | (Debug builds only) Runs the specified unit test 20 times in a row. Leave off :name to run all tests. |
| `--fake-mobile` | Simulates running on a mobile device. |
| `--test-high-dpi` | Simulates running *QGroundControl* on a high DPI device. |

Notes:

- Unit tests are included in debug builds automatically (as part of *QGroundControl*). *QGroundControl* runs under the control of the unit test (it does not start normally).
