---
title: "Radio Setup | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/radio.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "40b176081c97b2bc9a5c2789dd94ddea69639dc93dc525736088a9d96ec25268"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Radio Setup | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/radio.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="radio-setup"></a>

# Radio Setup

Radio Setup is used to configure the mapping of your main transmitter attitude control sticks (roll, pitch, yaw, throttle) to channels, and to calibrate the minimum, maximum, trim and reverse settings for all other transmitter controls/RC channels.

The main calibration process is identical for PX4 and ArduPilot (a number of additional flight-controller specific settings/tools are [detailed below](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/radio.html#additional-radio-setup)).

INFO

Before you can calibrate the radio system the receiver and transmitter must be connected/bound. The process for binding a transmitter and receiver pair is hardware specific (see your manual for instructions).

<a id="performing-the-calibration"></a>

## Performing the Calibration

The calibration process is straightforward - you will be asked to move the sticks in a specific pattern that is shown on the transmitter diagram on the top right of the screen. Simply follow the instructions to complete calibration.

To calibrate the radio:

1. Select the **Gear** icon (Vehicle Setup) in the top toolbar and then **Radio** in the sidebar.
2. Turn on your RC transmitter.
3. Press **OK** to start the calibration.

   INFO

   Calibration steps are the same for both PX4 and ArduPilot firmware, but the *Additional Radio setup* section will differ.
4. Set the *transmitter mode* radio button that matches your transmitter configuration (this ensures that *QGroundControl* displays the correct stick positions for you to follow during calibration).
5. Move the sticks to the positions indicated in the text (and on the transmitter image). Press **Next** when the sticks are in position. Repeat for all positions.
6. When prompted, move all other switches and dials through their full range (you will be able to observe them moving on the *Channel Monitor*).
7. Press **Next** to save the settings.

Radio calibration is demonstrated in the [PX4 setup video here](https://youtu.be/91VGmdSlbo4?t=4m30s) (youtube).

<a id="additional-radio-setup"></a>

## Additional Radio Setup

At the lower part of the *Radio Setup* screen is firmware-specific *Additional Radio setup* section. The options for each autopilot are shown below.

The additional settings differ between PX4 and ArduPilot firmware.

<a id="spectrum-bind-ardupilot-px4"></a>

### Spectrum Bind (ArduPilot/PX4)

Before you can calibrate the radio system the receiver and transmitter must be connected/bound. If you have a *Spektrum* receiver you can put it in *bind mode* using *QGroundControl* as shown below (this can be particularly useful if you don't have easy physical access to the receiver on your vehicle).

To bind a Spektrum transmitter/receiver:

1. Select the **Spektrum Bind** button
2. Select the radio button for your receiver
3. Press **OK**
4. Power on your Spektrum transmitter while holding down the bind button.

<a id="copy-trims-px4"></a>

### Copy Trims (PX4)

This setting is used to copy the manual trim settings from your radio transmitter so that they can be applied automatically within the autopilot. After this is done you will need to remove the manually set trims.

To copy the trims:

1. Select **Copy Trims**.
2. Center your sticks and move throttle all the way down.
3. Press **Ok**.
4. Reset the trims on your transmitter back to zero.

<a id="aux-passthrough-channels-px4"></a>

### AUX Passthrough Channels (PX4)

AUX passthrough channels allow you to control arbitrary optional hardware from your transmitter (for example, a gripper).

To use the AUX passthrough channels:

1. Map up to 2 transmitter controls to separate channels.
2. Specify these channels to map to the AUX1 and AUX2 ports respectively, as shown below. Values are saved to the vehicle as soon as they are set.

The flight controller will pass through the unmodified values from the specified channels out of AUX1/AUX2 to the connected servos/relays that drive your hardware.

<a id="param-tuning-channels-px4"></a>

### Param Tuning Channels (PX4)

Tuning channels allow you to map a transmitter tuning knob to a parameter (so that you can dynamically modify a parameter from your transmitter).

TIP

This feature is provided to enable manual in-flight tuning.

The channels used for parameter tuning are assigned in the *Radio* setup (here!), while the mapping from each tuning channel to its associated parameter is defined in the *Parameter editor*.

To set up tuning channels:

1. Map up to 3 transmitter controls (dials or sliders) to separate channels.
2. Select the mapping of *PARAM Tuning Id* to radio channels, using the selection lists. Values are saved to the vehicle as soon as they are set.

To map a PARAM tuning channel to a parameter:

1. Open the **Parameters** sidebar.
2. Select the parameter to map to your transmitter (this will open the *Parameter Editor*).
3. Check the **Advanced Settings** checkbox.
4. Click the **Set RC to Param...** button (this will pop-up the foreground dialog displayed below)
5. Select the tuning channel to map (1, 2 or 3) from the *Parameter Tuning ID* selection list.
6. Press **OK** to close the dialog.
7. Press **Save** to save all changes and close the *Parameter Editor*.

TIP

You can clear all parameter/tuning channel mappings by selecting menu **Tools \> Clear RC to Param** at the top right of the *Parameters* screen.
