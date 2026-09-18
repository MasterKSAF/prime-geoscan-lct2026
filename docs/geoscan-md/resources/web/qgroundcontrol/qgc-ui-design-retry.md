---
title: "User Interface Design | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/user_interface_design/index.html"
retrieved_at: "2026-09-15T18:09:54.449192+00:00"
source_sha256: "7ca6dff2b4f2ad272c8813ff19b532b3d33fed4bd68db68e0da6abc621580b68"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [User Interface Design | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/user_interface_design/index.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="user-interface-design"></a>

# User Interface Design

The main pattern for UI design in QGC is a UI page written in QML, many times communicating with a custom "Controller" written in C++. This follows a somewhat hacked variant of the MVC design pattern.

The QML code binds to information associated with the system through the following mechanisms:

- The custom controller
- The global `QGroundControl` object which provides access to things like the active Vehicle
- The FactSystem which provides access to parameters and in some cases custom Facts.

Note: Due to the complexity of the QML used in QGC as well as it's reliance on communication with C++ objects to drive the ui it is not possible to use the QML Designer provided by Qt to edit QML.
