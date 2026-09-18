---
title: "ArduPilot Flight Mode Setup | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/flight_modes_ardupilot.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "c90b355b8ccf048af10928a0f81719cef71ecc330993bcd897060a4ae6e2f014"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [ArduPilot Flight Mode Setup | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/flight_modes_ardupilot.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="ardupilot-flight-mode-setup"></a>

# ArduPilot Flight Mode Setup

The *Flight Modes* section allows you to configure which flight modes and other actions are triggered by particular switches/switch positions on your RC transmitter.

INFO

In order to set up flight modes you must already have

> - [Configured your radio](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/radio.html) in order to set flight modes.
> - [Setup the RC transmitter](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/flight_modes.html#transmitter-setup) (Flight Modes \> Transmitter Setup) :::

To access this section, select the **Gear** icon (Vehicle Configuration) in the top toolbar and then **Flight Modes** in the sidebar.

<a id="flight-mode-settings"></a>

## Flight Mode Settings

On ArduPilot you can assign up to 6 different flight modes to a single channel of your transmitter (the channel is selectable on Plane, but fixed to channel 5 on Copter). ArduCopter also allows you to specify additional *Channel Options* for channels 7-12. These allow you to assign functions to these switches (for example, to turn on a camera, or return to launch).

To set the flight modes:

1. Turn on your RC transmitter.
2. Select the **Gear** icon (Vehicle Configuration) in the top toolbar and then **Flight Modes** in the sidebar.

   INFO

   The above image is a screenshot of the flight mode setup for ArduCopter.

1. Select up to 6 flight modes in the drop downs.
2. **ArduCopter only:** Select additional *Channel Options* for channels 7-12.
3. **ArduPlane only:** Select the mode channel from the dropdown.
4. Test that the modes are mapped to the right transmitter switches by selecting each mode switch on your transmitter in turn, and check that the desired flight mode is activated (the text turns yellow on *QGroundControl* for the active mode).

All values are automatically saved as they are changed.

INFO

A typical setup uses a three position flight mode switch with an additional option of RTL being on a channel 7 switch. You can also setup 6 flight modes using two switches plus mixing on your transmitter. Scroll down to the center section of this [page](http://ardupilot.org/copter/docs/common-rc-transmitter-flight-mode-configuration.html#common-rc-transmitter-flight-mode-configuration) for tutorials on how to do that.

<a id="see-also"></a>

## See Also

- [ArduCopter Flight Modes](http://ardupilot.org/copter/docs/flight-modes.html)
- [ArduPlane Flight Modes](http://ardupilot.org/plane/docs/flight-modes.html)
- [ArduCopter \> Auxiliary Function Switches](https://ardupilot.org/copter/docs/channel-7-and-8-options.html#channel-7-and-8-options) - additional information about channel configuration.
