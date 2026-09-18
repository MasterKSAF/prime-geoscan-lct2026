---
title: "Parameters | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/parameters.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "94fc44615334dc6291fb4a8880acfd394c042d02cc76c723156e20ed377a3479"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Parameters | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/parameters.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="parameters"></a>

# Parameters

The *Parameters* screen allows you to find and modify any of the parameters associated with the vehicle.

Having trouble?

If parameters fail to download, see [Parameter Download Failures](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/parameter_download.html).

INFO

PX4 Pro and ArduPilot use different parameter sets, but they are both managed as described in this section.

<a id="finding-a-parameter"></a>

## Finding a Parameter

The parameters are organized in groups. Select a group of parameters to view by clicking on the buttons to the left.

You can also *search* for a parameter by entering a term in the *Search* field. This will show you a list of all parameter names and descriptions that contain the entered substring (press **Clear** to reset the search).

<a id="changing-a-parameter"></a>

## Changing a Parameter

To change the value of a parameter click on the parameter row in a group or search list. This will open a side dialog in which you can update the value (this dialog also provides additional detailed information about the parameter - including whether a reboot is required for the change to take effect).

INFO

When you click **Save** the parameter is automatically and silently uploaded to the connected vehicle. Depending on the parameter, you may then need to reboot the flight controller for the change to take effect.

<a id="tools"></a>

## Tools

You can select additional options from the **Tools** menu on the top right hand side of the screen.

**Refresh**
Refresh the parameter values by re-requesting all of them from the vehicle.

**Reset all to defaults**
Reset all parameters to their original default values.

**Load from file / Save to file**
Load parameters from an existing file or save your current parameter settings to a file.

**Clear RC to Param**
This clears all associations between RC transmitter controls and parameters. For more information see: [Radio Setup \> Param Tuning Channels](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/radio.html#param-tuning-channels-px4).

**Reboot Vehicle**
Reboot the vehicle (required after changing some parameters).
