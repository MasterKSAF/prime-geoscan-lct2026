---
title: "Mission Planner Initial SETUP — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/mission-planner-initial-setup.html"
retrieved_at: "2026-09-15T18:09:54.449192+00:00"
source_sha256: "f210d1cdfb5a839829263588c9b09a46423280b46799d4488dcef6f773b3bd46"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Mission Planner Initial SETUP — Mission Planner  documentation](https://ardupilot.org/planner/docs/mission-planner-initial-setup.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="mission-planner-initial-setup"></a>

<a id="id1"></a>

# Mission Planner Initial SETUP

This section of Mission Planner, invoked by the Menu item `SETUP` at the top of Mission Planner, has several subsections. The subsections are where you set up and configure your autopilot to prepare it for your particular vehicle. Typically these sections are “must do” actions that are required before first flight.

What you see when you enter this section depends on whether or not you are connected. Each menu item will bring up a new screen, each is discussed below with links to more detail.

<a id="install-firmware"></a>

## Install Firmware

You will see this menu item if the autopilot is both connected or not; however, this menu will only be functional when disconnected. If you have a new autopilot or if you want to update the control software that resides in your autopilot, you must install (upload) the [firmware](https://ardupilot.org/planner/docs/common-glossary.html#common-glossary) into it.

The firmware is located at [firmware.ardupilot.org](https://firmware.ardupilot.org). If the autopilot has ArduPilot firmware already installed, you can use this page to upload firmware for different vehicles or versions. If it does not, ArduPilot must be installed for the first time by other means than Mission Planner. See [Loading Firmware](https://ardupilot.org/planner/docs/common-loading-firmware.html#common-loading-firmware) for both cases.

From this screen you can also select “All Options” allowing you to select and load any variation of the firmware, or “Load custom firmware”, most often used when a developer has trial code to load.

<a id="install-firmware-legacy"></a>

## Install Firmware Legacy

Yet another way to load older versions of the firmware. Again, shown only when not connected.

<a id="mandatory-hardware"></a>

## Mandatory Hardware

You will only see this menu item if the autopilot is connected. Click this menu item to see the items you must set up before you attempt to operate your vehicle. Specifics are located in the ArduPilot.org documents which cover your specific vehicle (Copter, Plane, Rover, Blimp).

 [[../_images/MP-mandatory-hardware.png](https://ardupilot.org/planner/_images/MP-mandatory-hardware.png)](https://ardupilot.org/planner/_images/MP-mandatory-hardware.png)

Before operating the vehicle, you must setup:

- [Accel Calibration](https://ardupilot.org/planner/docs/common-accelerometer-calibration.html#common-accelerometer-calibration)
- [Compass (optional for Plane)](https://ardupilot.org/planner/docs/common-compass-calibration-in-mission-planner.html#common-compass-calibration-in-mission-planner)
- [Radio Calibration](https://ardupilot.org/planner/docs/common-radio-control-calibration.html#common-radio-control-calibration)
- Servo Output : configure each [output’s function](https://ardupilot.org/sub/docs/common-rcoutput-mapping.html#common-rcoutput-mapping). Default values get loaded upon initial firmware installation, but be sure to check them here.
- [ESC Calibration](https://ardupilot.org/copter/docs/esc-calibration.html#esc-calibration) for Copter only (not required for ESCs running DShot protocol, but must be [configured](https://ardupilot.org/sub/docs/common-brushless-escs.html#common-brushless-escs) in ArduPilot) Plane and Rover use their own [ESC Calibration](https://ardupilot.org/sub/docs/common-esc-calibration.html#common-esc-calibration) technique, but is also a mandatory setup item.
- Flight Modes: Refer to [Plane](https://ardupilot.org/plane/docs/flight-modes.html#flight-modes), [Copter](https://ardupilot.org/copter/docs/flight-modes.html#flight-modes) or [Rover](https://ardupilot.org/rover/docs/rover-control-modes.html#rover-control-modes) mode pages.
- Failsafe: Refer to [Plane](https://ardupilot.org/plane/docs/apms-failsafe-function.html#apms-failsafe-function), [Copter](https://ardupilot.org/sub/docs/failsafe-landing-page.html#failsafe-landing-page) or [Rover](https://ardupilot.org/rover/docs/rover-failsafes.html#rover-failsafes) failsafe pages.

<a id="optional-hardware"></a>

## Optional Hardware

This submenu allows the configuration of optional devices, many of which can be configured while Mission Planner is unconnected. Programming of the Sik Telemetry Radio, UAVCAN setup, PX4 Optical Flow sensor, and Antenna Tracker can be done here, as well as the setup of a [joystick](https://ardupilot.org/sub/docs/common-joystick.html#common-joystick) to be used in conjunction with Mission Planner.

When connected, peripherals such as Battery Monitors, Integrated OSD, Airspeed Sensors, and Rangefinders can be configured. Also, this submenu has a Motor Test function allowing you to test the direction and order of Copter and QuadPlane Motors.

<a id="dronecan-uavcan-slcan"></a>

<a id="id2"></a>

### DroneCAN/UAVCAN SLCAN

The SLCAN tool inside Mission Planner allows viewing, configuration, and software updates of DroneCAN nodes connected to the CAN bus port of the autopilot. There are two ways to connect to the DroneCAN node:

- Using SLCAN directly
- Using SLCAN over MAVLink

<a id="connecting-to-the-dronecan-node"></a>

#### Connecting to the DroneCAN node

If using the direct SLCAN connection method, autopilot parameters have to be configured first. See [SLCAN Access on F4 based Autopilots](https://ardupilot.org/sub/docs/common-slcan-f4.html#common-slcan-f4) or [SLCAN Access on F7/H7 Based Autopilots](https://ardupilot.org/sub/docs/common-slcan-f7h7.html#common-slcan-f7h7) for setup information. Mission Planner should be in the disconnected state, and make sure the SLCAN port is shown as the selected COM port in the dropdown box in the upper right corner of Mission Planner.

If using the MAVLink method, nothing is required for setup and Mission Planner should be in the connected state via the normal MAVLink connection to the autopilot.

In Mission Planner, navigate to Initial Setup-\>Optional Hardware-\>DroneCAN/UAVCAN click on the highlighted red button if connecting using the direct SLCAN method, or the appropriate green button for MAVLink communication over either CAN bus port 1 or port 2, depending on which port the node is attached.

[../_images/can-drivers-parameters-slcan-mp.png](https://ardupilot.org/planner/_images/can-drivers-parameters-slcan-mp.png)

The autopilot will connect to Mission Planner using SLCAN, the window will populate with DroneCAN nodes connected.

[../_images/can-slcan-mpc.png](https://ardupilot.org/planner/_images/can-slcan-mpc.png)

If the node has a bootloader only installed, then the firmware will need to be uploaded. `MAINTENANCE` will be displayed. Click on update firmware. Firmware can be found [here](https://firmware.ardupilot.org/AP_Periph/) and downloaded for the node.

[../_images/can-slcan-mp-maint.png](https://ardupilot.org/planner/_images/can-slcan-mp-maint.png)

A pop-up will open. Select no and then find firmware for your node previously downloaded and select it.

[../_images/can-slcan-mp-srch.png](https://ardupilot.org/planner/_images/can-slcan-mp-srch.png)

The window will show the firmware being uploaded and a pop-up will show the status.

[../_images/can-slcan-mp-upd.png](https://ardupilot.org/planner/_images/can-slcan-mp-upd.png)

[../_images/can-slcan-mp-updw.png](https://ardupilot.org/planner/_images/can-slcan-mp-updw.png)

Once complete mode will change to `OPERATIONAL`. Press the `Parameters` button to access node settings. From here DroneCAN device parameters can be accessed or changed.

[../_images/can_slcan_mp_param.png](https://ardupilot.org/planner/_images/can_slcan_mp_param.png)

Clicking on `Inspector` will open a popup window to view messages on the CAN bus.

[../_images/can-slcan-mp-insp.png](https://ardupilot.org/planner/_images/can-slcan-mp-insp.png)

To return to normal Mission Planner operation, change to another tab, and re-connect. You may need to wait 2 seconds before re-connecting.

<a id="dronecan-firmware-flashing-video"></a>

<a id="dronecan-firmware-flashing"></a>

## DroneCAN Firmware Flashing Video

<a id="advanced"></a>

## Advanced

This section is for advanced users.

[../_images/MP-advanced-setup.png](https://ardupilot.org/planner/_images/MP-advanced-setup.png)

- Warning Manager: You can create custom warning messages to be displayed on the HUD and in the messages tab of the DATA screen, based on the values of the status items.
- MAVLink Inspector: allows monitoring, real-time, of the various MAVLink status messages being received.
- Proximity: View the data from a 360 lidar, if equipped
- Mavlink Signing: This allows you to setup [secure communications](https://ardupilot.org/planner/docs/common-MAVLink2-signing.html#common-mavlink2-signing) with the vehicle.
- Mavlink mirror: This allows you to forward the MAVLink traffic to another network-connected location for monitoring. Also see [MAVProxy Forwarding](https://ardupilot.org/mavproxy/docs/getting_started/forwarding.html#mavproxy-forwarding) for another method.
- NMEA: Output the vehicle location as a NMEA GPS string over the network or to a COM port
- Follow Me: If using an attached NEMA mode GPS on a COM port to establish the MP GPS location, can send Guided Mode waypoints to the vehicle to follow the GCS.
- Param Gen: Regenerates Mission Planners parameter list. Occasionally required if new firmware parameters are not being displayed.
- Moving Base: if NMEA GPS is attached to PC, shows PCs location as moving on the map display
- Anon Log: Allows you to hide your location when sharing log files by creating a version with scrambled locations
- FFT: Plot an FFT from a log that has IMU batch sampling enabled. See [Managing Gyro Noise with the Dynamic Harmonic Notch Filters](https://ardupilot.org/plane/docs/common-imu-notch-filtering.html#common-imu-notch-filtering) for an example of its use.
