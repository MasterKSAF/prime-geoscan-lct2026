---
title: "DOWNLOADS: Firmware — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-downloads_firmware.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "f877532b52d69717d3e753d0300ca0ffad5728c3e828689994790de36691622a"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [DOWNLOADS: Firmware — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-downloads_firmware.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="downloads-firmware"></a>

<a id="common-downloads-firmware"></a>

# DOWNLOADS: Firmware

The latest firmware for all of the vehicles is available from the [firmware server](https://firmware.ardupilot.org/). This includes:

- [Copter](https://firmware.ardupilot.org/Copter)
- [Plane](https://firmware.ardupilot.org/Plane)
- [Rover](https://firmware.ardupilot.org/Rover)
- [AntennaTracker](https://firmware.ardupilot.org/AntennaTracker)
- [Sub](https://firmware.ardupilot.org/Sub)
- [Blimp](https://firmware.ardupilot.org/Blimp)

This page provides additional links to a number of specific builds that are considered “significant” - for example, the last builds of Copter to fit on the APM2.x board.

Tip

The firmware server additionally hosts GCS installers and other tools:

- [Mission Planner](https://firmware.ardupilot.org/Tools/MissionPlanner)
- [APM Planner 2.0](https://firmware.ardupilot.org/Tools/APMPlanner)
- [RadioSiK](https://firmware.ardupilot.org/SiK)
- [Developer Builds](https://firmware.ardupilot.org/devbuild)
- [Build and Development Tools](https://firmware.ardupilot.org/Tools)
- [Companion Computers and associated example code](https://github.com/ArduPilot/companion)
- [AP Peripherals](https://firmware.ardupilot.org/AP_Periph)

Note

ArduPilot also provides a [Custom Firmware Build Server](https://custom.ardupilot.org) that allows creating customized firmware builds including only the features desired. This is useful for 1MB autopilots which have their standard firmware builds limited in some features in order to fit the code into available flash space on these autopilots.

<a id="firmware"></a>

## Firmware

The following firmware is “special” in that it represents some significant milestone - e.g. “the last version of a build for a particular autopilot”.

<a id="arducopter-apm-2-x-firmware"></a>

### ArduCopter APM 2.x Firmware

ArduCopter v3.2.1 firmware for APM 2.x. This is the **last build** of ArduCopter that still fits on the **APM 2.x** boards.

- [ArduCopter\_APM\_2.0\_Firmware\_3.2.1.zip](https://download.ardupilot.org/downloads/wiki/firmware/ArduCopter_APM_2.0_Firmware_3.2.1.zip)

<a id="arducopter-apm-1-0-firmware"></a>

### ArduCopter APM 1.0 Firmware

ArduCopter v3.2.1 firmware for APM 1.0. This is the last build of ArduCopter that still fits on the **APM 1.0** boards.

- [ArduCopter\_APM\_1.0\_Firmware\_3.2.1.zip](https://download.ardupilot.org/downloads/wiki/firmware/ArduCopter_APM_1.0_Firmware_3.2.1.zip)

<a id="bootloader"></a>

## Bootloader

Bootloaders for various electronics created by ArduPilot Group

<a id="apm2-x-autopilot"></a>

## APM2.x Autopilot

Bootloader for APM2.x autopilot series

- Bootloader for: [32u2 MCU](https://firmware.ardupilot.org/downloads/bootloader/Arduino-usbdfu.hex)
- Bootloader for: [2560 MCU](https://firmware.ardupilot.org/downloads/bootloader/stk500boot_v2_mega2560.hex)

You need AVR programmer with ISP connector to burn these boot loaders.

<a id="license"></a>

## License

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [GNU General Public License](http://www.gnu.org/licenses/gpl.html) for more details.

<a id="safety"></a>

## Safety

Operating a powered vehicle of any kind can be a lot of fun. However, nothing will ruin your day at the park more quickly than an accident or running afoul of the law. Since we want you to have a great experience, please make sure that you do all of the following:

- Operate within all local laws and regulations. For example, in the United States, current regulations require you to operate most UAVs under 400 foot above ground level, within line of site, and away from obstructions and populated areas. Since these regulations vary from place to place, even within the same country, ensure that you understand what you need to do to stay compliant.
- Never operate the vehicle or software in a way that could be dangerous to you, other people, or property. Propellers, while rotating, could easily cut you; if a UAV fell on a person or object, it could cause injury; a UAV caught in power lines could cause an outage. As Ben Franklin said, “An ounce of prevention is worth a pound of cure.”
- Always keep in mind that software and hardware failures happen. Although we design our products to minimize such issues, you should always operate with the understanding that a failure could occur at any point of time and without warning. As such, you should take the appropriate precautions to minimize danger in case of failure.
- Never use the software or hardware for manned vehicles. The software and hardware we provide is only for use in unmanned vehicles.
