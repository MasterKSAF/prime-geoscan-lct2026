---
title: "Mock Link | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/tools/mock_link.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "599a2e783867e1b26de2f90aa986b9b48d701a50475502e2620952eb96e8a191"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Mock Link | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/tools/mock_link.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="mock-link"></a>

# Mock Link

*Mock Link* allows you to create and stop links to multiple simulated (mock) vehicles in *QGroundControl* debug builds.

The simulation does not support flight, but does allow easy testing of:

- Mission upload/download
- Viewing and changing parameters
- Testing most setup pages
- Multiple vehicle UIs

It is particularly useful for unit testing error cases for mission upload/download.

<a id="using-mock-link"></a>

## Using Mock Link

To use *Mock Link*:

1. Create a debug build by [building the source](https://github.com/mavlink/qgroundcontrol#supported-builds).
2. Access *Mock Link* by selecting the *Application Settings* icon in the top toolbar and then **Mock Link** in the sidebar.
3. The buttons in the panel can be clicked to create a vehicle link of the associated type.

   - Each time you click a button a new connection will be created.
   - When there is more than one connection the multiple-vehicle UI will appear.
4. Click the **Stop one Mock Link** to stop the currently active vehicle.

Using *Mock Link* is then more or less the same as using any other vehicle, except that the simulation does not allow flight.
