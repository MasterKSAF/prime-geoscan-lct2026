---
title: "PX4 Flight Modes Setup | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/flight_modes_px4.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "8e10cdd86ad6264c67b654b19feb17a30c33178eb810d590c3f7f766827e24f6"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [PX4 Flight Modes Setup | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/flight_modes_px4.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="px4-flight-modes-setup"></a>

# PX4 Flight Modes Setup

The *Flight Modes* section allows you to configure which [flight modes](http://docs.px4.io/main/en/getting_started/flight_modes.html) and other actions are triggered by particular switches/switch positions on your RC transmitter.

INFO

In order to set up flight modes you must already have

- [Configured your radio](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/radio.html) in order to set flight modes.
- [Setup the RC transmitter](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/flight_modes.html#transmitter-setup) (Flight Modes \> Transmitter Setup)

To access this section, select the **Gear** icon (Vehicle Setup) in the top toolbar and then **Flight Modes** in the sidebar.

<a id="flight-mode-settings"></a>

## Flight Mode Settings

The screen allows you to specify a "mode" channel and select up to 6 flight modes that will be activated based on the value sent on the channel. You can also assign a small number of channels to trigger particular actions, such as deploying landing gear, or emergency shutdown (kill switch).

The steps are:

1. Turn on your RC transmitter.
2. Select the **Gear** icon (Vehicle Setup) in the top toolbar and then **Flight Modes** in the sidebar.
3. Specify *Flight Mode Settings*:

   - Select the transmitter **Mode channel** (shown as Channel 5 above).
   - Select up to six **Flight Modes** for switch positions encoded in the channel.

     INFO

     Position mode, return mode and mission mode [are recommended](https://docs.px4.io/main/en/config/flight_mode.html#what-flight-modes-and-switches-should-i-set).
4. Specify *Switch Settings*:

   - Select the channels that you want to map to specific actions - *Kill switch*, landing gear, etc. (if you have spare switches and channels on your transmitter).
5. Test that the modes are mapped to the right transmitter switches:

   - Check the *Channel Monitor* to confirm that each switch moves the expected channel.
   - Select each mode switch on your transmitter in turn, and check that the desired flight mode is activated (the text turns yellow on *QGroundControl* for the active mode).

All values are automatically saved as they are changed.

<a id="see-also"></a>

## See Also

- [PX4 Flight Modes](https://docs.px4.io/main/en/flight_modes/)
