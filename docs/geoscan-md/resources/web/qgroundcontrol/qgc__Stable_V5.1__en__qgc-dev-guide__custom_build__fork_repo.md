---
title: "Initial Repository Setup For Custom Build | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/fork_repo.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "d0eade9c929048158b93c659a06a7cce4f94c9ee6851d41fd39405c4e782674f"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Initial Repository Setup For Custom Build | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/fork_repo.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="initial-repository-setup-for-custom-build"></a>

# Initial Repository Setup For Custom Build

- Navigate to the [QGC repo](https://github.com/mavlink/qgroundcontrol) and create your own fork.
- Copy the `custom_example` directory to a new `custom` directory at the root of the repo.
- Tweak the source in `custom` directory as needed.

You can also rename the `custom-example` directory to `custom` but that can lead to merge problems when you bring your fork up to date with newer upstream version of regular QGC.

<a id="modifying-mainline-qgc-source-code"></a>

## Modifying Mainline QGC Source Code

When creating your own custom build it is not uncommon to discover that you may need a tweak/addition to regular QGC source in places where the custom build architecture falls short. By discussing those needed changes firsthand with QGC devs and submitting pulls to make the custom build architecture better you make QGC more powerful for everyone and give back to the community.

It is best to keep modifications in mainline QGC source to a minimum. Since every change there may make it more difficult for you to keep up to date with merging in changes from regular QGC as it moves forward.
