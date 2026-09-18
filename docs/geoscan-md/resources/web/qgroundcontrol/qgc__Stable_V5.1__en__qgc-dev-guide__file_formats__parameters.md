---
title: "Parameters File Format | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/file_formats/parameters.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "25ee5814e96dc703283b4bfa00a230c0f30448d763564a3274195518ad0deebb"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Parameters File Format | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/file_formats/parameters.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="parameters-file-format"></a>

# Parameters File Format

```text
# Onboard parameters for Vehicle 1
#
# # Vehicle-Id Component-Id Name Value Type
1	1	ACRO_LOCKING	0	2
1	1	ACRO_PITCH_RATE	180	4
1	1	ACRO_ROLL_RATE	180	4
1	1	ADSB_ENABLE	0	2
```

Above is an example of a parameter file with four parameters. The file can include as many parameters as needed.

Comments are preceded with a `#`.

This header: `# MAV ID COMPONENT ID PARAM NAME VALUE` describes the format for each row:

- `Vehicle-Id` Vehicle id
- `Component-Id` Component id for parameter
- `Name` Parameter name
- `Value` Parameter value
- `Type` Parameter type using MAVLink `MAV_PARAM_TYPE_*` enum values

A parameter file contains the parameters for a single Vehicle. It can contain parameters for multiple components within that Vehicle.
