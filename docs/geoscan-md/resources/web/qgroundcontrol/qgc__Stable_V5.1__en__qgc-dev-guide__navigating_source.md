---
title: "Navigating QGC Source Code | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/navigating_source.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "7703281a4bf300e1fed74cde048c102df7776052e37f1207651e17c0fbf40539"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Navigating QGC Source Code | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/navigating_source.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="navigating-qgc-source-code"></a>

# Navigating QGC Source Code

QGC is a large code base and it can be daunting to find what you are looking for in the source.

Below are listed some tips to help you find what you are looking for.

<a id="use-the-api-reference"></a>

## Use the API Reference

Doxygen documentation can be found at [https://api.qgroundcontrol.com/](https://api.qgroundcontrol.com/). This can be easier to navigate and search than the source itself.

<a id="start-from-the-top-of-the-ui"></a>

## Start from the top of the UI

The top level window Qml UI code is found in `MainWindow.qml`. You can start here and work your way down through the UI hierarchy till you find what you are looking for.

In this qml file you'll find things like:

- How the toolbar is created
- How the top level views are created: Fly, Plan, ...

<a id="global-search"></a>

## Global Search

The best way to find something is to find the UI which is closest to what you are looking for by doing text searches.

<a id="example-find-the-source-for-the-gps-drop-down-in-the-toolbar"></a>

### Example: Find the source for the GPS drop down in the toolbar

In the dropdown you see the words "Vehicle GPS Status". Do a global search for those words. Make sure you are doing a case sensitive search. Also make sure you are matching whole words. It can also be helpful to exclude the `*.ts` translation files. Since they can lead to multiple results. If you do the search described here it will take you right to `GPSIndicatorPage.qml`. Some times a search may lead to many results in both qml and .cpp files. In this case limit the results to `*.qml` files.
