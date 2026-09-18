---
title: "Connect Mission Planner to AutoPilot — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-connect-mission-planner-autopilot.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "38a4506d999232d872a0c8e21c8f9006199931664b470108796991e452052a1b"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Connect Mission Planner to AutoPilot — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-connect-mission-planner-autopilot.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="connect-mission-planner-to-autopilot"></a>

<a id="common-connect-mission-planner-autopilot"></a>

# Connect Mission Planner to AutoPilot

This article explains how to connect *Mission Planner* to an autopilot in order to receive telemetry and control the vehicle.

Note

There are separate instructions for connecting in order to [Load Firmware](https://ardupilot.org/planner/docs/common-loading-firmware.html#common-loading-firmware).

<a id="setting-up-the-connection"></a>

## Setting up the connection

To establish a connection you must first choose the communication method/channel you want to use, and then set up the physical hardware and Windows device drivers. You can connect the PC and autopilot using USB cables, [Telemetry Radios](https://ardupilot.org/copter/docs/common-telemetry-landingpage.html#common-telemetry-landingpage), [Bluetooth](https://ardupilot.org/sub/docs/common-mission-planner-bluetooth-connectivity.html#common-mission-planner-bluetooth-connectivity-detailed-connecting-with-mission-planner), IP connections etc.

Note

The driver for your connection hardware must be present on Windows as this makes your connection’s COM port and default data rate available to *Mission Planner*.

<a id="id2"></a>

 [[../_images/pixhawk_usb_connection.jpg](https://ardupilot.org/planner/_images/pixhawk_usb_connection.jpg)](https://ardupilot.org/planner/_images/pixhawk_usb_connection.jpg)

Pixhawk USB Connection

<a id="id3"></a>

 [[../_images/new-radio-laptop.jpg](https://ardupilot.org/planner/_images/new-radio-laptop.jpg)](https://ardupilot.org/planner/_images/new-radio-laptop.jpg)

Connection using SiK Radio

On *Mission Planner*, the connection and data rate are set up using the drop down boxes in the upper right portion of the screen.

 [[../_images/MisionPlanner_ConnectButton.png](https://ardupilot.org/planner/_images/MisionPlanner_ConnectButton.png)](https://ardupilot.org/planner/_images/MisionPlanner_ConnectButton.png)

Once you’ve attached the USB or Telemetry Radio, Windows will automatically assign your autopilot a COM port number, and that will show in the drop-down menu (the actual number does not matter). The appropriate data rate for the connection is also set (typically the USB connection data rate is 115200 and the radio connection rate is 57600).

Select the desired port and data rate and then press the **CONNECT** button to connect to the autopilot. After connecting **Mission Planner** will download parameters from the autopilot and the button will change to **DISCONNECT** as shown:

 [[../_images/MisionPlanner_DisconnectButton.png](https://ardupilot.org/planner/_images/MisionPlanner_DisconnectButton.png)](https://ardupilot.org/planner/_images/MisionPlanner_DisconnectButton.png)

Tip

The “select port” dropdown also contains TCP or UDP port options that can be used to connect to an autopilot over a network.

The “Stats…” hotlink beneath the port selection box, if clicked, will give information about the connection, such as if [Signing security](https://ardupilot.org/planner/docs/common-MAVLink2-signing.html#common-mavlink2-signing) is active, link stats, etc. Sometimes this window pops up beneath the current screen and will have to be brought to the front to be seen.

 [[../_images/MP-stats.png](https://ardupilot.org/planner/_images/MP-stats.png)](https://ardupilot.org/planner/_images/MP-stats.png)

<a id="connecting-to-multiple-vehicles"></a>

### Connecting to multiple vehicles

Additional connections can be made by right-clicking the **CONNECT** button and selecting **Connection Options** from the drop-down list.

 [[../_images/MP-connect-rightclick-menu.png](https://ardupilot.org/planner/_images/MP-connect-rightclick-menu.png)](https://ardupilot.org/planner/_images/MP-connect-rightclick-menu.png)

A file with a pre-written list of connections can be loaded with the **Connection List** drop-down option. This is an example format of the file:

```text
tcp://127.0.0.1:5670
udp://127.0.0.1:14550
udpcl://192.168.1.255:14550
serial:com4:115200
```

<a id="troubleshooting"></a>

## Troubleshooting

If Mission Planner is unable to connect:

- Check that the correct baud rate is used for the selected method (115200 on USB or 57600 on Radio/Telemetry)
- If attaching via USB, be sure that a few seconds after power up have passed before attempting to connect. If you attempted to connect during the bootloader initialization time, Windows may get the wrong USB information. Connection attempts after this may require that the USB connection be unplugged and re-plugged,then wait for bootloader to enter the main code ( few seconds), then attempt the connection. Occasionally, MP must be restarted if an attempt to connect is made while in the bootloader initialization period.
- If using a COM port on Windows, check that the connection’s COM port exists in the Windows Device Manager’s list of serial ports.
- If your autopilot has an F7 or H7 processor and has CAN ports, then see the section below, [Troubleshooting Composite Connections](https://ardupilot.org/planner/docs/common-connect-mission-planner-autopilot.html#troubleshooting-composite-connections)
- If using a USB port, try a different physical USB port
- If using a UDP or TCP connection, check that your firewall is not blocking IP traffic

You should also ensure that the autopilot controller board has appropriate ArduPilot firmware installed and has booted correctly (on Pixhawk there are useful [LEDs](https://ardupilot.org/sub/docs/common-leds-pixhawk.html#common-leds-pixhawk) and [Sounds](https://ardupilot.org/sub/docs/common-sounds-pixhawkpx4.html#common-sounds-pixhawkpx4) which can tell you the state of the autopilot).

If using a remote link (not USB) and Mission Planner connects, but does not download parameters or you cannot get commands, like mode changes acted upon,then the autopilot probably has Signing turned on. See [MAVLink2 Signing](https://ardupilot.org/planner/docs/common-MAVLink2-signing.html#common-mavlink2-signing).

<a id="troubleshooting-composite-connections"></a>

<a id="id1"></a>

## Troubleshooting Composite Connections

Autopilots with F7 or H7 processors and having CAN interfaces use firmware that presents two USB interfaces: One for the normal MAVLink connection, and one for SLCAN serial connections to the CAN interface for configuration and firmware updates.This is called a composite USB device.

By default, the MAVLink USB interface is SERIAL0 and the SLCAN USB interface is the highest SERIALx port the board presents. The Windows driver currently installed with Mission Planner may select to use either one, and since both are set by default in ArduPilot firmware for MAVLINK protocol, it will work fine, whichever one it chooses as the COM port.

However, there is a situation where the user will find that it will not connect to the obvious COM port in the Mission Planner dropdown box.This occurs when the user accidentally changes the protocol of whichever SERIALx port the Windows driver is using as the MAVLink COM port to something other than MAVLink. This can easily happen if the user takes an existing parameter file from a vehicle configuration used with a different autopilot that has the protocol changed. For example, the user has a plane with non F7/H7 CAN capable autopilot and upgrades it to one that is, then loads his existing parameter file while setting up the plane with the new autopilot. As soon as the parameter file is loaded and the autopilot is rebooted, communication is lost and cannot be re-established.

What has occurred, is that the protocol for the SERIALx port that Windows was using has been changed. Almost always, this is the highest numbered SERIALx port since that is commonly set to -1 on non-CAN capable autopilots, and the Windows COM port driver has selected this interface as the COM port instead of SERIAL0.

The procedure to recover is as follows:

<a id="loading-composite-usb"></a>

- Go to Windows Device Manager and find the COM port being used by the autopilot in the Ports listings. It will have the COM Port # you used to connect initially to Mission Planner. Right click and it will present “Update driver software” as one of the options. Click it.

[../_images/devicemanager.png](https://ardupilot.org/planner/_images/devicemanager.png)

- Click the “Browse my computer……” option and then click the “Choose from a list…” option and you will see this screen:

[../_images/composite-driver.png](https://ardupilot.org/planner/_images/composite-driver.png)

- Scroll down the top list until “Composite USB” option appears and click it.
- Now reconnect your autopilot to the PC and two COM ports will be presented. One will connect (the remaining one with MAVLink Protocol) and the other will not. If you do not connect to one, try the other. But DO NOT disconnect the autopilot from the PC or the composite driver will unload and you will have to start over.
- Now that you are connected to Mission Planner, change back the protocol of the Serialx port protocol to 2 (MAVLink2). You can now disconnect and reconnect the autopilot and it will present only one COM port and you should be able to connect from now on. Do not change this protocol from now on unless trying to utilize the SLCAN interface. It may be a bit unfamiliar since the Mission Planner SERIALx port being used is no longer the normal SERIAL0 but rather,the highest port, but this does not affect anything in the autopilot’s configuration and operation.

<a id="related-topics"></a>

## Related topics

[Mission Planner Bluetooth Connectivity](https://ardupilot.org/sub/docs/common-mission-planner-bluetooth-connectivity.html#common-mission-planner-bluetooth-connectivity-detailed-connecting-with-mission-planner)
