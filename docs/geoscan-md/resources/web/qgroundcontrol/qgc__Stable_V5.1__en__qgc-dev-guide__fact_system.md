---
title: "Fact System | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/fact_system.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "af05bcd76d5d224707067c6477b0078c1279afc979b3739d10077e96414c5740"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Fact System | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/fact_system.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="fact-system"></a>

# Fact System

The Fact System provides a set of capabilities which standardizes and simplifies the creation of the QGC user interface.

<a id="fact"></a>

## Fact

A Fact represents a single value within the system.

<a id="factmetadata"></a>

## FactMetaData

There is `FactMetaData` associated with each fact. It provides details on the Fact in order to drive automatic user interface generation and validation.

<a id="fact-controls"></a>

## Fact Controls

A Fact Control is a QML user interface control which connects to a Fact and it's `FactMetaData` to provide a control to the user to modify/display the value associated with the Fact.

<a id="factgroup"></a>

## FactGroup

A *Fact Group* is a group of [Facts](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/fact_system.html#fact). It is used to organise facts and manage user defined facts.

<a id="custom-build-support"></a>

## Custom Build Support

User defined facts can be added by overriding `factGroups` function of `FirmwarePlugin` in a custom firmware plugin class. These functions return a name to fact group map that is used to identify added fact groups. A custom fact group can be added by extending `FactGroup` class. FactMetaDatas could be defined using the appopriate `FactGroup` constructor by providing a json file containing necessery information.

Changing the metadata of existing facts is also possible by overriding `adjustMetaData` of `FirmwarePlugin` class.

A fact associated with a vehicle (including facts belonging to fact groups returned in `factGroups` function of the vehicles Firmware plugin) can be reached using `getFact("factName")` or `getFact("factGroupName.factName")`

For additional information please refer to comments in [FirmwarePlugin.h](https://github.com/mavlink/qgroundcontrol/blob/v4.0.8/src/FirmwarePlugin/FirmwarePlugin.h).
