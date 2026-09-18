---
title: "Developer Tools | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/tools/index.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "c67cc71ce5e2291a364ea3a04f6970fa3e05d207b82b715f2526c4f6b6e377c5"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Developer Tools | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/tools/index.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="developer-tools"></a>

# Developer Tools

*QGroundControl* makes a number of tools available primarily for autopilot developers. These ease common developer tasks including setting up simulated connections for testing, and accessing the System Shell over MAVLink.

INFO

[Build the source in debug mode](https://github.com/mavlink/qgroundcontrol#supported-builds) to enable these tools.

Tools include:

- **[Mock Link](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/tools/mock_link.html)** (Debug Builds only) - Creates and stops multiple simulated vehicle links.
- **[Replay Flight Data](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/replay_flight_data.html)** - Replay a telemetry log (User Guide).
- **[MAVLink Inspector](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/mavlink_inspector.html)** - Display received MAVLink messages/values and plot trends.
- **[MAVLink Console](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/mavlink_console.html)** (PX4 Only) - Connect to the PX4 nsh shell and send commands.
