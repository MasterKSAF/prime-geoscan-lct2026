---
title: "User Interface Controls | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/user_interface_design/controls.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "c332798f472820447090af88d03b1e7abb212c9d789018699e6173681b8b7dd6"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [User Interface Controls | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/user_interface_design/controls.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="user-interface-controls"></a>

# User Interface Controls

QGC provides a base set of controls for building user interface. In general they tend to be thin layers above the base QML Controls supported by Qt which respect the QGC color palette.

```text
import QGroundControl.Controls
```

<a id="qt-controls"></a>

## Qt Controls

The following controls are QGC variants of standard Qt QML Controls. They provide the same functionality as the corresponding Qt controls except for the fact that they are drawn using the QGC palette.

- QGCButton
- QGCCheckBox
- QGCColoredImage
- QGCComboBox
- QGCFlickable
- QGCLabel
- QGCMovableItem
- QGCRadioButton
- QGCSlider
- QGCTextField

<a id="qgc-controls"></a>

## QGC Controls

These custom controls are exclusive to QGC and are used to create standard UI elements.

- DropButton - RoundButton which drops out a panel of options when clicked. Example is Sync button in Plan view.
- ExclusiveGroupItem - Used as a base Item for custom controls which supports the QML ExclusiveGroup concept.
- QGCView - Base control for all top level views in the system. Provides support for FactPanels and displaying QGCViewDialogs and QGCViewMessages.
- QGCViewDialog - Dialog which pops out from the right side of a QGCView. You can specific the accept/reject buttons for the dialog as well as the dialog contents. Example usage is when you click on a parameter and it brings up the value editor dialog.
- QGCViewMessage - A simplified version of QGCViewDialog which allows you to specify buttons and a simple text message.
- QGCViewPanel - The main view contents inside of a QGCView.
- RoundButton - A round button control which uses an image as its inner contents.
- SetupPage - The base control for all Setup vehicle component pages. Provides a title, description and component page contents area.
- SelectableControl - Allows users to select from a list of controls to display. Right-click on Desktop or Press and Hold on Mobile will show selection UI. Example usage: Allows user to select between multiple Instrument display variants.
