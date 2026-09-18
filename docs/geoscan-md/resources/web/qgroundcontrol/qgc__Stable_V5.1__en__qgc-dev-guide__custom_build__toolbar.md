---
title: "Toolbar Customization | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/toolbar.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "577ddfc3d3a3f571a65610cc66e2dbd20561db2ba68bc7db6d40f2dfdb979798"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Toolbar Customization | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/toolbar.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="toolbar-customization"></a>

# Toolbar Customization

The toolbar can be customized in a number of ways to fit your custom build needs. The toolbar internally is made up of a number of sections from left to right:

- View Switching
- Indicators

  - App Indicators
  - Vehicle Indicators
  - Vehicle Mode Indicators
- Connection Management
- Branding

The Indicator section varies based on the view currently displayed:

- Fly View - Shows all indicators
- Plan View - Show no indicators and has its own custom indicator section for Plan status values
- Other Views - Do not show Vehicle Mode Indicators

<a id="customization-possibilities"></a>

## Customization Possibilities

<a id="indicators"></a>

### Indicators

You can add your own indicators for display or remove any of the upstream indicators. The mechanism you use depends on the indicator type.

<a id="app-indicators"></a>

#### App Indicators

These provide information to the user which is not associated with a vehicle. For example RTK status. To manipulate the list of app indicators you use `QGCPlugin::toolbarIndicators`.

<a id="vehicle-indicators"></a>

#### Vehicle Indicators

These are indicators which are associated with information about the vehicle. They are only available when a vehicle is connected. To manipulate the list of vehicle indicators you override `FirmwarePlugin::toolIndicators`.

<a id="modifying-the-toolbar-ui-itself"></a>

### Modifying the toolbar UI itself

This is accomplished by using resource overrides on the qml files associated with the toolbar. This provides a high level of customization but also a higher level of complexity. The primary ui for the toolbar is in `MainToolBar.qml`. The main window code in `MainWindow.qml` interacts with the toolbar to show different indicator sections based on current view as well as whether the mode indicators show or not also based on current view.

If you want full control over the toolbar then you can override `MainToolBar.qml` and make your own completely different version. You will need to pay special attention to the interactions of the main toolbar with `MainWindow.qml` since you are going to need to replicated those interactions in your own custom version.

There are two standard indicator ui sections of the toolbar:

<a id="maintoolbarindicators-qml"></a>

#### `MainToolBarIndicators.qml`

This is used for all views except Plan. It display all the indicators in a row. Although you can override this file, in reality it doesn't do much other than layout for indicators.

<a id="plantoolbarindicators-qml"></a>

#### `PlanToolBarIndicators.qml`

This is used by the Plan view to show the status values. If you want to change that ui you can override this file and provide your own custom version.
