---
title: "File Formats | MAVLink Guide"
source_url: "https://mavlink.io/en/file_formats/"
retrieved_at: "2026-09-15T18:41:16.759136+00:00"
source_sha256: "8d1382c4a3d89c8e86413a8298badc65fc42ae0aeef443c6048da2ac8b70b591"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [File Formats | MAVLink Guide](https://mavlink.io/en/file_formats/). Авторы: MAVLink contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="file-formats"></a>

# File Formats

MAVLink systems often need to be able to store, exchange, or restore MAVLink information, including: mission plans, geofence definitions, rally points, parameters, logs, etc. Often the information is defined on one system and used on another (e.g. logs from an autopilot are parsed by analysis tools, missions are created using GCS planning tools and run from a companion computer).

There is a *defacto* standard used in many GCS systems and developer APIs for storing *mission* information: [plain-text file format](https://mavlink.io/en/file_formats/#mission_plain_text_file).

INFO

At time of writing there are no MAVLink standards (defacto or otherwise) for: geofence, rally points, parameters etc. There is a discussion about standardising file formats in [Issue #989](https://github.com/mavlink/mavlink/issues/989).

<a id="mission_plain_text_file"></a>

## Mission Plain-Text File Format

*QGroundControl* and many other GCS support an older plain-text format for missions. This is not officially part of MAVLink and does not allow rally point or geofence information to be provided.

The format is shown below. The first line contains the file format and version information, while subsequent line(s) are mission items.

```text
QGC WPL <VERSION>
<INDEX> <CURRENT WP> <COORD FRAME> <COMMAND> <PARAM1> <PARAM2> <PARAM3> <PARAM4> <PARAM5/X/LATITUDE> <PARAM6/Y/LONGITUDE> <PARAM7/Z/ALTITUDE> <AUTOCONTINUE>
```

INFO

The spaces between the numbers/fields above are `<tab>` (i.e. `\t` in most programming languages).

For example:

```text
QGC WPL 110
0	1	0	16	0.149999999999999994	0	0	0	8.54800000000000004	47.3759999999999977	550	1
1	0	0	16	0.149999999999999994	0	0	0	8.54800000000000004	47.3759999999999977	550	1
2	0	0	16	0.149999999999999994	0	0	0	8.54800000000000004	47.3759999999999977	550	1
```
