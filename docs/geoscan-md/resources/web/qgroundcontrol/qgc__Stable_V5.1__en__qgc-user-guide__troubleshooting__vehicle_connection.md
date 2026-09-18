---
title: "Vehicle Connection Problems | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/vehicle_connection.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "84fe311e686fb00069eaa691cdf05e543181de3ca0eb41fbf06cfcc18de472fa"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Vehicle Connection Problems | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/vehicle_connection.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="vehicle-connection-problems"></a>

# Vehicle Connection Problems

<a id="vehicle-does-not-show-up-in-ui"></a>

## Vehicle does not show up in UI

QGC will automatically connect to a vehicle as soon as a communication link is created (using USB, or WiFi, etc.) If you establish that link and you don't see your vehicle show up in the QGC UI you can use [console logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html) to help debug the problem.

Use the following steps to debug the issue:

- Start with the hardware vehicle link not connected. Don't plug in the USB connection and/or establish the WiFi link in your OS for example.
- Turn on `Comms.LinkManager` [console logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html) in QGC. This will log output about the link which QGC sees and connects to.
- Establish the hardware vehicle communication link.
- The console log output should display something like this:

  text

  ```text
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:563 - "Waiting for bootloader to finish "/dev/cu.usbmodem01""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:563 - "Waiting for bootloader to finish "/dev/cu.usbmodem01""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:563 - "Waiting for bootloader to finish "/dev/cu.usbmodem01""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:563 - "Waiting for bootloader to finish "/dev/cu.usbmodem01""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:572 - "Waiting for next autoconnect pass "/dev/cu.usbmodem4201""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:613 - "New auto-connect port added:  "ArduPilot ChibiOS on cu.usbmodem4201 (AutoConnect)" "/dev/cu.usbmodem4201""
  ```
- The first few lines indicate QGC has established a hardware link and finally the auto-connect.

If you don't see any of this then QGC is not recognizing the hardware link. To see if your hardware is being recognized at the OS level do this:

- Start with the hardware vehicle link not connected. Don't plug in the USB connection and/or establish the WiFi link in your OS for example.
- Turn on `Comms.LinkManager:verbose` [console logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html) in QGC. This will log output for all serial hardware connections that QGC recognizes.
- You will see continuous output of the serial ports on your device.
- Plug in your USB comm device.
- You should see a new device show in in the console output. Example:

  text

  ```text
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:520 - "-----------------------------------------------------"
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:521 - "portName:           "cu.usbmodem4201""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:522 - "systemLocation:     "/dev/cu.usbmodem4201""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:523 - "description:        "Pixhawk1""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:524 - "manufacturer:       "ArduPilot""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:525 - "serialNumber:       "1B0034000847323433353231""
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:526 - "vendorIdentifier:   1155"
  [D] at /Users/travis/build/mavlink/qgroundcontrol/src/comm/LinkManager.cc:527 - "productIdentifier:  22336"
  ```
- After that it should continue to log a connection to that device as shown in the first example.

If you don't see a new serial port should up in the console output when you plug it in then something is likely wrong with your hardware at the OS level.

<a id="error-vehicle-is-not-responding"></a>

## Error: Vehicle is not responding

This indicates that although QGC was able to connect to the hardware link to your vehicle there is no telemetry going back and forth on the link. This can unfortunately indicate a number of problems:

- Hardware communication setup problems
- Firmware problems

Lastly it can happen if QGC attempts to automatically connect to a device which is connected to your computer which isn't a vehicle. You can identify this case using the steps above and noting the device information which QGC is attempting to connect to. In order to make auto-connect work the filter it uses on devices it attempts to auto-connect to is somewhat broad and can be incorrect. If you find this happening you will need to turn off auto-connect from General Settings and create a manual connection to the comm link for your vehicle. You can also remove the device causing the problem from your computer but that may not always be possible.
