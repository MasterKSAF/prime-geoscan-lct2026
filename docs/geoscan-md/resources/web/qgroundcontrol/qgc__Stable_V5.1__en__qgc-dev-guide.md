---
title: "QGroundControl Dev Guide (Daily Builds) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "f7a658b430d1a71c67e2a7d2c9088d7cdda3fe09ec0659b01e09451bd1a633c1"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [QGroundControl Dev Guide (Daily Builds) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="qgroundcontrol-dev-guide-daily-builds"></a>

# QGroundControl Dev Guide (Daily Builds)

[[Discuss](https://img.shields.io/badge/discuss-dev-ff69b4.svg)](http://discuss.px4.io/c/qgroundcontrol/qgroundcontrol-developers) [[Discord](https://discordapp.com/api/guilds/1022170275984457759/widget.png?style=shield)](https://discord.com/channels/1022170275984457759/1022185820683255908)

This developer guide is the best source for information if you want to build, modify or extend [QGroundControl](http://qgroundcontrol.com) (QGC). It shows how to obtain and build the source code, explains how QGC works, and provides guidelines for contributing code to the project.

TIP

This part of the guide is for **developers**!

WARNING

This is an active work in progress - information should be correct, but may not be complete! If you find that it is missing helpful information (or errors) please raise an issue or better yet submit a pull request to the docs with updated information.

<a id="design-philosophy"></a>

## Design Philosophy

QGC is designed to provide a single codebase that can run across multiple OS platforms as well as multiple device sizes and styles.

The QGC user interface is implemented using Qt Qml. Qml provides for hardware acceleration which is a key feature on lower powered devices such as tablets or phones. Qml also provides features which allows us to more easily create a single user interface which can adapt itself to differing screen sizes and resolution.

The QGC UI targets itself more towards a tablet+touch style of UI than a desktop mouse-based UI. This make a single UI easier to create since tablet style UI also tends to work fine on desktop/laptops.

<a id="support"></a>

## Support

Development questions can be raised in the [QGroundControl Developer](http://discuss.px4.io/c/qgroundcontrol/qgroundcontrol-developers) discuss category.

<a id="contribution"></a>

## Contribution

Information about contributing, including coding styles, testing and licenses can be found in [Code Submissions](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/contribute/).

TIP

We expect all contributors to adhere to the [QGroundControl code of conduct](https://github.com/mavlink/qgroundcontrol/blob/master/.github/CODE_OF_CONDUCT.md). This code aims to foster an open and welcoming environment.

<a id="translations"></a>

### Translations

We use [Crowdin](https://crowdin.com) to make it easier to manage translation for both *QGroundControl* and the documentation.

The translation projects (and join links) are listed below:

- [QGroundControl](https://crowdin.com/project/qgroundcontrol) ([join](https://crwd.in/qgroundcontrol))
- [QGroundControl User Guide](https://crowdin.com/project/qgroundcontrol-user-guide) ([join](https://crwd.in/qgroundcontrol-user-guide))
- [QGroundControl Developer Guide](https://crowdin.com/project/qgroundcontrol-developer-guide) ([join](https://crwd.in/qgroundcontrol-developer-guide))

The PX4 Developer Guide contains additional information about the (common) docs/translation toolchain:

- [Documentation](https://docs.px4.io/main/en/contribute/docs)
- [Translation](https://docs.px4.io/main/en/contribute/docs.html)

<a id="license"></a>

## License

*QGroundControl* source code is [dual-licensed under Apache 2.0 and GPLv3](https://github.com/mavlink/qgroundcontrol/blob/master/.github/COPYING.md). For more information see: [Licenses](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/contribute/licences.html).

<a id="governance"></a>

## Governance

The QGroundControl ground station is hosted under the governance of the [Dronecode Project](https://www.dronecode.org/).
