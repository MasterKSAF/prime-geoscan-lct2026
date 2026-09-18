---
title: "Unit Tests | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/contribute/unit_tests.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "372b7444aff55055c94138dda32c310ba6a84482d72684a6b384ee9a39bfc464"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Unit Tests | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/contribute/unit_tests.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="unit-tests"></a>

# Unit Tests

*QGroundControl* (QGC) contains a set of unit tests that must pass before a pull request will be accepted. The addition of new complex subsystems to QGC should include a corresponding new unit test to test it.

The full list of unit tests can be found in [UnitTestList.cc](https://github.com/mavlink/qgroundcontrol/blob/master/test/UnitTestList.cc).

To run unit tests:

1. Build in `debug` mode with `QGC_UNITTEST_BUILD` definition.
2. Copy the **deploy/qgroundcontrol-start.sh** script in the **debug** directory
3. Run *all* unit tests from the command line using the `--unittest` command line option. For Linux this is done as shown:

   ```text
   qgroundcontrol-start.sh --unittest
   ```
4. Run *individual* unit tests by specifying the test name as well: `--unittest:RadioConfigTest`. For Linux this is done as shown:

   ```text
   qgroundcontrol-start.sh --unittest:RadioConfigTest
   ```
