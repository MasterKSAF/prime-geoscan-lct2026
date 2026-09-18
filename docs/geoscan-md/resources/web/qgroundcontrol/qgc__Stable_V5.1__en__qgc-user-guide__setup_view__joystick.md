---
title: "Joystick Setup | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/joystick.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "b36945297eb16e47fd0553e63d03f10e0b8dc660a4edd7d9ce5fb63f863e8cf7"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Joystick Setup | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/joystick.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="joystick-setup"></a>

# Joystick Setup

*QGroundControl* allows you to control a vehicle using a joystick or gamepad instead of an RC Transmitter.

INFO

Flying with a Joystick (or [virtual thumb-sticks](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/virtual_joystick.html)) requires a reliable high bandwidth telemetry channel to ensure that the vehicle is responsive to joystick movements (because joystick information is sent over MAVLink).

INFO

Joystick and Gamepad support is enabled using the cross-platform [SDL2](http://www.libsdl.org/index.php) library. Compatibility with a particular controller depends on SDL (all buttons that are exposed by that API are displayed through the *QGroundControl* UI). A [number of common joysticks and gamepads](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/joystick.html#supported-joysticks) are known to work.

INFO

The joystick is *enabled* as the last step of the calibration process.

<a id="enabling-px4-joystick-support"></a>

## Enabling PX4 Joystick Support

To enable Joystick support in PX4 you need to set the parameter [`COM_RC_IN_MODE`](https://docs.px4.io/en/main/advanced_config/parameter_reference.html#COM_RC_IN_MODE) to `1` - *Joystick*. If this parameter is `0` then *Joystick* will not be offered as a setup option.

This is enabled by default for PX4 SITL builds (see the [Parameters](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/parameters.html) topic for information on how to find and set a particular parameter).

<a id="ardupilot-joystick-support"></a>

## Ardupilot Joystick Support

All ArduPilot vehicles are supported. No parameter configuration is necessary.

<a id="configure"></a>

## Configuring the Joystick

To configure a joystick:

1. Start *QGroundControl* and connect to a vehicle.
2. Connect the Joystick or Gamepad to a USB port.
3. Select the **Gear** icon (Vehicle Setup) in the top toolbar and then **Joystick** in the sidebar. The screen below will appear.
4. Make sure your joystick is selected in the **Active joystick** dropdown.
5. Go to the **Calibrate** Tab, press the **Start** button and then follow the on-screen instructions to calibrate/move the sticks.

   The joystick is *enabled* as the last step of the calibration process.

   WARNING

   On some controllers the calibration process does not work because of incorrect channel mappings. You can follow [supported joysticks section](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/joystick.html#supported-joysticks) for more information.
6. Test the buttons and sticks work as intended by pressing them, and viewing the result in the Axis/Button monitor in the **General** tab.
7. Select the flight modes/vehicle functions activated by each joystick button.

<a id="advanced-options"></a>

## Advanced Options

Some additional Options are available at the **Advanced** tab. These options may be useful for specific, unsual setups, for increasing sensibility, and for handling noisy joysticks.

<a id="throttle-options"></a>

### Throttle Options

- **Center stick is zero throttle**: Centered or lowered stick sends 0 in [MANUAL\_CONTROL **z**](https://mavlink.io/en/messages/common.html#MANUAL_CONTROL), raised stick sends 1000.

  - **Spring loaded throttle smoothing**: In this mode you control not the throttle itself, but the rate at which it increases/decreases. This is useful for setups where the throttle stick is spring loaded, as the user can hold the desired throttle while releasing the stick.
- **Full down stick is zero throttle**: In this mode, lowered stick sends 0 in [MANUAL\_CONTROL **z**](https://mavlink.io/en/messages/common.html#MANUAL_CONTROL), centered stick 500, and raised 1000.
- **Allow negative thrust**: When in **Center stick is zero throttle** mode, this allows the user to send negative values by lowering the stick. So that lowered stick sends -1000 in [MANUAL\_CONTROL **z**](https://mavlink.io/en/messages/common.html#MANUAL_CONTROL), centered sends zero, and raised stick sends 1000. This mode is only enabled for vehicles that support negative thrust, such as [Rover](http://ardupilot.org/rover/index.html).

<a id="expo"></a>

### Expo

The expo slider allows you to make the sticks less sensitive in the center, allowing finer control in this zone.

The slider adjusts the curvature of the exponential curve.

The higher the Expo value, the flatter the curve is at the center, and steeper it is at the edges.

<a id="advanced-settings"></a>

### Advanced Settings

The advanced settings are not recommended for everyday users. They can cause unpredicted results if used incorrectly.

The following settings are available:

- **Enable Gimbal Control**: Enabled two additional channels for controlling a gimbal.
- **Joystick Mode**: Changes what the joystick actually controls, and the MAVLink messages sent to the vehicle.

  - **Normal**: User controls as if using a regular RC radio, MAVLink [MANUAL\_CONTROL](https://mavlink.io/en/messages/common.html#MANUAL_CONTROL) messages are used.
  - **Attitude**: User controls the vehicle attitude, MAVLink [SET\_ATTITUDE\_TARGET](https://mavlink.io/en/messages/common.html#SET_ATTITUDE_TARGET) messages are used.
  - **Position**: User controls the vehicle position, MAVLink [SET\_POSITION\_TARGET\_LOCAL\_NED](https://mavlink.io/en/messages/common.html#SET_POSITION_TARGET_LOCAL_NED) messages with bitmask for **position** only are used.
  - **Force**: User controls the forces applied to the vehicle, MAVLink [SET\_POSITION\_TARGET\_LOCAL\_NED](https://mavlink.io/en/messages/common.html#SET_POSITION_TARGET_LOCAL_NED) messages with bitmask for **force** only are used.
  - **Velocity**: User controls the forces applied to the vehicle, MAVLink [SET\_POSITION\_TARGET\_LOCAL\_NED](https://mavlink.io/en/messages/common.html#SET_POSITION_TARGET_LOCAL_NED) messages with bitmask for **velocity** only are used.
- **Axis Frequency**: When the joystick is idle (inputs are not changing), the joystick commands are sent to the vehicle at 5Hz. When the joystick is in use (input values are changing), the joystick commands are sent to the vehicle at the (higher) frequency configured by this setting. The default is 25Hz.
- **Button Frequency**: Controls the frequency at which repeated button actions are sent.
- **Enable Circle Correction**: RC controllers sticks describe a square, while joysticks usually describe a circle. When this option is enabled a square is inscribed inside the joystick movement area to make it more like an RC controller (so it is possible to reach all four corners). The cost is decreased resolution, as the effective stick travel is reduced.

  - **Disabled:** When this is **disabled** the joystick position is sent to the vehicle unchanged (the way that it is read from the joystick device). On some joysticks, the (roll, pitch) values are confined to the space of a circle inscribed inside of a square. In this figure, point B would command full pitch forward and full roll right, but the joystick is not able to reach point B because the retainer is circular. This means that you will not be able to achieve full roll and pitch deflection simultaneously.
  - **Enabled:** The joystick values are adjusted in software to ensure full range of commands. The usable area of travel and resolution is decreased, however, because the area highlighted grey in the figure is no longer used.
- **Deadbands:** Deadbands allow input changes to be ignored when the sticks are near their neutral positions. This helps to avoid noise or small oscillations on sensitive sticks which may be interpreted as commands, or small offsets when sticks do not re-center well. They can be adjusted during the first step of the [calibration](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/joystick.html#configure), or by dragging vertically on the corresponding axis monitor.

<a id="supported-joysticks"></a>

## Supported Joysticks

The following joysticks/controllers have been shown to work with relatively recent *QGroundControl* builds.

<a id="sony-playstation-3-4-controllers"></a>

### Sony Playstation 3/4 Controllers

Both these joysticks are highly recommended. They work well "out of the box" and have many buttons that you can map to flight modes.

<a id="sony-ps4-dualshock-4-controller-v2-wireless-setup"></a>

#### Sony PS4 - DualShock 4 Controller V2 (Wireless setup)

This controller supports both USB and Bluetooth wireless connection. Wired USB connection usually works out of the box. The wireless connection needs some setup.

<a id="linux-ubuntu-setup"></a>

##### Linux Ubuntu setup

To make the controller work wirelessly under Linux the [jstest-gtk](https://jstest-gtk.gitlab.io/) and [ds4drv](https://github.com/chrippa/ds4drv) utilities are needed.

The steps are:

1. Install *jstest-gtk*:

   ```text
   sudo apt install jstest-gtk
   ```
2. Install *ds4drv*:

   ```text
   sudo pip install ds4drv
   ```
3. Run ds4drv

   ```text
   sudo ds4drv
   ```
4. Hold **Share** button and then **PS** button until controller LED starts blinking rapidly. The *ds4drv* should then detect a new device.
5. Last of all, you should check the controller setup by running the *jstest-gtk* utility.

<a id="frsky-taranis-xd9-plus"></a>

### FrSky Taranis XD9 plus

The *FrSky Taranis XD9 plus* remote control can also be connected as a joystick. You will need to connect it via the USB port on the back.

The Taranis does not allow you to use button options (to be precise, you can set the options, but toggling the buttons on your transmitter does not cause them to be pressed).

INFO

The Taranis is an open system that is openly being worked on. It is possible that at time of writing there is a firmware or configuration that allows it to work effectively as a joystick.

<a id="tbs-tango-2"></a>

### TBS Tango 2

The TBS Tango 2 can also be used as a joystick controlled via QGroundControl. In order to make it work, you need to remap the channels by using the following commands:

bash

```text
export SDL_GAMECONTROLLERCONFIG="03002de7d80400001057000011010000,Team-BlackSheep TBS Joystick,a:b0,b:b1,x:b3,y:b4,back:b10,guide:b12,start:b11,leftstick:b13,rightstick:b14,leftshoulder:b6,rightshoulder:b7,leftx:a0,lefty:a1,rightx:a2,righty:a3,lefttrigger:a4,righttrigger:a5,crc:e72d,platform:Linux"
./QGroundControl-x86_64.AppImage
```

For another radio, the first command above can be found by using the [jstest software tool](http://github.com/meleu/jstest-sdl) and run:

bash

```text
jstest-sdl -l
```

**Take care of the channels remapping you need to do between a2, a3 and other if needed**

<a id="logitech-gamepad-f310"></a>

### Logitech Gamepad F310

The Logitech Gamepad F310 has been tested via USB on MacOSX "Sierra".

<a id="logitech-extreme-3d-pro"></a>

### Logitech Extreme 3D Pro

The [Logitech Extreme 3D Pro](http://gaming.logitech.com/en-ch/product/extreme-3d-pro-joystick) Joystick has been tested on all platforms (Linux, Windows, Mac OSX). This is a single stick controller that can also be twisted. The main stick axes are used for pitch and roll, while the twist action is used for yaw. The throttle is mapped onto a separate wheel.

<a id="logitech-f710-gamepad"></a>

### Logitech F710 Gamepad

This gamepad is great for flying a multirotor manually via QGroundControl. It works on Windows, Linux and Mac OS.

<a id="mac-os-leopard-lion-setup"></a>

#### Mac OS Leopard / Lion Setup

The F710 is detected under Leopard / Lion but is not automatically configured as an input device. In order to get a working configuration, the F710 has to be recognised as *Rumblepad2*.

First check how it is recognised: **Apple \> About this Mac \> Additional Information \> System Report \> USB**. It is detected as "Logitech Cordless RumblePad 2" then nothing further needs to be done.

If it is detected as a "Logitech Wireless 710", perform these steps:

1. Unplug the USB receiver of the gamepad
2. Prepare to quickly plug it into a USB port
3. Hit the Logitech button (its silver with the Logitech Logo on it in the center of the pad)
4. Quickly connect the USB receiver to your Mac
5. The pad should now be detected in the system report as "Logitech Cordless RumblePad 2". If not, retry the above steps.
