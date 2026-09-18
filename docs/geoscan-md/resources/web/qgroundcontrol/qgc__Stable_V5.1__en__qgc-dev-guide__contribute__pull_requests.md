---
title: "Pull Requests | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/contribute/pull_requests.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "d4f7aadf8f136bee21e4452f4e26e2ba6c612f0b6f3366c1680bea728a5925e1"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Pull Requests | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/contribute/pull_requests.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="pull-requests"></a>

# Pull Requests

All pull requests go through the QGC CI build system which builds release and debug version. Builds will fail if there are compiler warnings. Also unit tests are run against supported OS debug builds.

<a id="automatic-release-note-generation"></a>

## Automatic Release Note Generation

Release notes are generated from the following GitHub labels, which should be set on Pull Requests as appropriate:

- "RN: MAJOR FEATURE"
- "RN: MINOR FEATURE"
- "RN: IMPROVEMENT"
- "RN: REFACTORING"
- "RN: BUGFIX"
- "RN: NEW BOARD SUPPORT"

There are also a set of the above labels which end in "- CUSTOM BUILD" which indicate the changes is associated with the custom build architecture.
