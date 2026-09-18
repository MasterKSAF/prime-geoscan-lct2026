---
title: "Release Process for Custom Builds [WIP Docs] | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/release_branching_process.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "2a6bd7f43103ecbf2bae6a1521e9ff3985728459b00a9db81dd7667f9acbda88"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Release Process for Custom Builds [WIP Docs] | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/release_branching_process.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="release-process-for-custom-builds-wip-docs"></a>

# Release Process for Custom Builds \[WIP Docs\]

One of the trickier aspects of creating your own custom build is the process to keep it up to date with regular QGC. This document describes a suggested process to follow. But in reality you are welcome to use whatever branching and release strategy you want for your custom builds.

<a id="upstream-qgc-release-branching-strategy"></a>

## Upstream QGC release/branching strategy

The best place to start is understanding the mechanism QGC uses to do it's own releases. We will layer a custom build release process on top of that. You can find standard QGC [release process here](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/release_branching_process.html).

<a id="custom-build-release-types"></a>

## Custom build/release types

Regular QGC has two main build types: Stable and Daily. The build type for a custom build is more complex. Throughout this discussion we will use the term "upstream" to refer to the main QGC repo ([https://github.com/mavlink/qgroundcontrol](https://github.com/mavlink/qgroundcontrol)). Also when we talk about a "new" upstream stable release, this means a major/minor release, not a patch release.

<a id="synchronized-stable"></a>

### Synchronized Stable

This type of release is synchronized with the release of an upstream stable. Once QGC releases stable you then release a version of your custom build which is based on this stable. This build will include all the new features from upstream including the new feature in your own custom code.

<a id="out-of-band-stable"></a>

### Out-Of-Band Stable

This a subsequent release of your custom build after you have released a synchronized stable but prior to upstream releasing a new stable. It only includes new features from your own custom build and include no new features from upstream. Work on this type of release would occur on a branch which is either based on your latest synchronized stable or your last out of band release if it exists. You can release out of band stable releases at any time past your first synchronized stable release.

<a id="daily"></a>

### Daily

Your custom daily builds are built from your `master` branch. It is important to keep your custom master up to date with QGC master. If you lag behind you may be surprised by upstream features which require some effort to integrate with your build. Or you may even require changes to "core" QGC in order to work with your code. If you don't let QGC development team know soon enough, it may end up being too late to get things changed.

<a id="options-for-your-first-build"></a>

## Options for your first build

<a id="starting-with-a-synchronized-stable-release"></a>

### Starting with a Synchronized Stable release

It is suggested that you start with releasing a Synchronized Stable. This isn't necessary but it is the simplest way to get started. To set your self up for a synchronized stable you create your own branch for development which is based on the upstream current stable.

<a id="starting-with-daily-builds"></a>

### Starting with Daily builds

The reason why you may consider this as your starting point is because you need features which are only in upstream master for your own custom builds. In this case you will have to live with releasing custom Daily builds until the next upstream stable. At which point you would release you first Synchronized Stable. For this setup you use your master branch and keep it in sync with upstream master as you develop.

<a id="after-you-release-your-first-synchronized-stable"></a>

## After you release your first Synchronized Stable

<a id="patch-releases"></a>

### Patch Releases

As upstream QGC does patch releases on Stable you should also release your own patch releases based on upstream to keep your stable up to date with latest criticial bug fixes.

<a id="out-of-band-daily-one-or-the-other-or-both"></a>

### Out-Of-Band, Daily: One or the other or both?

At this point you can decide which type of releases you want to follow. You can also decide to possibly do both. You can do smaller new features which don't require new upstream features using out of band releases. And you can do major new feature work as daily/master until the point you can do a new synchronized stable.
