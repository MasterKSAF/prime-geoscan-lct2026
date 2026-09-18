---
title: "MAVLink Customisation | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/mavlink.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "8eec608e702efe8b970b32ef803be3a63f6c933df8193b577b080f6acee7ea5c"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [MAVLink Customisation | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/mavlink.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="mavlink-customisation"></a>

# MAVLink Customisation

QGC communicates with flight stacks using [MAVLink](https://mavlink.io/en/), a very lightweight messaging protocol that has been designed for the drone ecosystem.

QGC includes the [all.xml](https://mavlink.io/en/messages/all.html) dialect by default. The `all.xml` includes all other dialects in the [mavlink/mavlink](https://github.com/mavlink/mavlink/tree/master/message_definitions/v1.0) repository, and allows it to communicate with both PX4 and Ardupilot. Previous versions of QGC (v4.2.8 and earlier), used the `ArduPilotMega.xml` dialect.

In order to add support for a new set of messages you should add them to [development.xml](https://mavlink.io/en/messages/development.html), [ArduPilotMega.xml](https://mavlink.io/en/messages/ardupilotmega.html), or [common.xml](https://mavlink.io/en/messages/common.html) (for PX4), or fork *QGroundControl* and include your own dialect.

To modify the version of MAVLink used by QGC:

- Update the CMake MAVLink Options in [/qgroundcontrol/cmake/CustomOptions.cmake](https://github.com/mavlink/qgroundcontrol/tree/master/cmake/CustomOptions.cmake) or when using the built-in custom build support you can override these options in [/qgroundcontrol/custom/cmake/CustomOverrides.cmake](https://github.com/mavlink/qgroundcontrol/tree/master/custom-example/cmake/CustomOverrides.cmake).

  - QGC\_MAVLINK\_GIT\_REPO - This is a link to the git repo to use, by default this is a link to [https://github.com/mavlink/c\_library\_v2](https://github.com/mavlink/c_library_v2). You can also [build your own libraries](https://mavlink.io/en/getting_started/generate_libraries.html) using the MAVLink toolchain and upload to your own git repo.
  - QGC\_MAVLINK\_GIT\_TAG - This points to the git tag you would like to use in the chosen repo. This should likely be updated on occasion to use the latest version of MAVLink.
  - You can also set the mavlink directory to a local path by using the CMake variable CPM\_mavlink\_SOURCE. Just add to [/qgroundcontrol/cmake/CustomOptions.cmake](https://docs.qgroundcontrol.com/cmake/CustomOptions.cmake.html):

  cmake

  ```text
  set(CPM_mavlink_SOURCE "/path/to/your/custom/mavlink")
  ```
