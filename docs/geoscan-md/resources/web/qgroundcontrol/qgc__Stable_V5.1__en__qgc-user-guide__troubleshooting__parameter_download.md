---
title: "Parameter Download failures | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/parameter_download.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "efd511105060e25e5f4f7d49cc1886c516afd85c3eecf580a7571c7f0a0a1a62"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Parameter Download failures | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/parameter_download.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="parameter-download-failures"></a>

# Parameter Download failures

The majority of parameter download failures are caused by a communication link which is noisy and has a high loss rate. Although the parameter protocol has retry logic for such a case it will eventually give up. At which point you will get an error stating that QGC was unable to retrieve the full set or parameters.

Although you can still fly the vehicle in this state it is not recommended. Also the vehicle setup pages will not be available.

You can see the loss rate for your link from the [App Settings \> Telemetry](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/telemetry.html) page. Even a loss rate in the high single digits can lead to intermittent failures of the plan protocols. Higher loss rates could lead to 100% failure.

There is also the more remote possibility of either firmware or QGC bugs. To see the details of the back and forth message traffic of the protocol you can turn on the `FactSystem.ParameterManager` [console logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html) category.
