---
title: "Resource Overrides | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/resource_override.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "96d095730740b64709a7ea92442f56d7654b1bd562d55cb0ef8e10f7e1ea5473"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Resource Overrides | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/resource_override.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="resource-overrides"></a>

# Resource Overrides

A "resource" in QGC source code terminology is anything found in Qt resources file:

- [qgcresources.qrc](https://github.com/mavlink/qgroundcontrol/blob/Stable_V5.1/qgcresources.qrc)
- Per-module `.qrc` files declared via `qt_add_resources` in the relevant `CMakeLists.txt` (e.g., under `src/`)
- Qml files

Overriding a resource allows you to replace it with your own version. This could be as simple as a single icon, or as complex as replacing an entire Vehicle Setup page of UI QML code. Note that using resource overrides means you are duplicating regular QGC source code. This can be a good or a bad thing, depending on how you go about it. By using a resource override on a QML file, for example, allows you to avoid dealing with merge conflicts when merging newer versions of the upstream QGC source. However, it also means that you need to pay attention to the latest version of the QGC source code to see if you need to modify your copied code in a similar way.

Resource overrides work by using `QQmlEngine::addUrlInterceptor` to intercept requests for resources and re-route the request to available custom resources instead of the standard ones. Look at [custom\_example/src/CustomPlugin.cc](https://github.com/mavlink/qgroundcontrol/blob/Stable_V5.1/custom-example/src/CustomPlugin.cc) for how has been done, and replicate it in your own custom build source.

Custom resources, that are meant to override, have the prefix `/Custom` added to their resource name in the custom resource file. The file alias for the resource should be exactly the same as the standard QGC resource. For examples of how to do any of this, take a look at [custom\_example/custom.qrc](https://github.com/mavlink/qgroundcontrol/blob/Stable_V5.1/custom-example/custom.qrc) and [custom\_example/CMakeLists.txt](https://github.com/mavlink/qgroundcontrol/blob/Stable_V5.1/custom-example/CMakeLists.txt).
