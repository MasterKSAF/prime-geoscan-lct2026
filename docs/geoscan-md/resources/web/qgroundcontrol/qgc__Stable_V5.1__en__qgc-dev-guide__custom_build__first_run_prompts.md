---
title: "First Run Prompts | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/first_run_prompts.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "494086d6ed07c48c7fa1b4f029e8507241d44a276b26016e74d9fc9bd435598b"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [First Run Prompts | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/first_run_prompts.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="first-run-prompts"></a>

# First Run Prompts

When QGC is started for the first time it prompts the user to specify some initial settings. At the time of writing this documentation those are:

- Unit Settings - What units does the user want to use for display.
- Offline Vehicle Settings - Vehicle information for creating Plans while not connected to a vehicle.

The custom build architecure includes mechanisms for a custom build to both override the display of these prompts and/or create your own first run prompts.

<a id="first-run-prompt-dialog"></a>

## First Run Prompt Dialog

Each first run prompt is a simple dialog which can display ui to the user. Whether the specific dialog has already been show to the user or not is stored in a setting. Here is the code for the upstream first run prompt dialogs:

- [FirstRunPrompt](https://github.com/mavlink/qgroundcontrol/blob/master/src/FirstRunPromptDialogs/FirstRunPrompt.qml) - base class
- [InitialSetupPrompt](https://github.com/mavlink/qgroundcontrol/blob/master/src/FirstRunPromptDialogs/InitialSetupPrompt.qml) - units & offline vehicle settings

<a id="standard-first-run-prompt-dialogs"></a>

## Standard First Run Prompt Dialogs

Each dialog has a unique ID associated with it. When that dialog is shown to the user that ID is registered as having already been displayed so it only happens once (unless you clear settings). The set of first run prompt which are included with upstream QGC are considered the "Standard" set. QGC gets the list of standard prompts to display from the `QGCCorePlugin::firstRunPromptStdIds` call.

```text
    /// Returns the standard list of first run prompt ids for possible display. Actual display is based on the
    /// current AppSettings::firstRunPromptIds value. The order of this list also determines the order the prompts
    /// will be displayed in.
    virtual QList<int> firstRunPromptStdIds(void);
```

You can override this method in your custom build if you want to hide some of those.

<a id="custom-first-run-prompt-dialogs"></a>

## Custom First Run Prompt Dialogs

Custom builds have the ability to create their own set of additional first run prompts as needed through the use of the following QGCCorePlugin method overrides:

```text
    /// Returns the custom build list of first run prompt ids for possible display. Actual display is based on the
    /// current AppSettings::firstRunPromptIds value. The order of this list also determines the order the prompts
    /// will be displayed in.
    virtual QList<int> firstRunPromptCustomIds(void);
```

```text
    /// Returns the resource which contains the specified first run prompt for display
    Q_INVOKABLE virtual QString firstRunPromptResource(int id);
```

Your QGCCorePlugin should override these two methods as well as provide static consts for the ids of your new first run prompts. Look at how the standard set is implemented for how to do this and take the same approach.

<a id="order-of-display"></a>

## Order Of Display

The set of first run prompts shown to the user are in the order returned by the `QGCCorePlugin::firstRunPromptStdIds` and `QGCCorePlugin::firstRunPromptCustomIds` with standard prompts shown before the custom prompts. Only the prompts which have not been previously shown to the user are shown.

<a id="always-on-prompts"></a>

## Always On Prompts

By setting the `markAsShownOnClose: false` property in your prompt ui implementation you can create a prompt which will show up each time QGC starts. This can be used for things like showing usage tips to your users. If you do this it is best to make sure that this is displayed last.
