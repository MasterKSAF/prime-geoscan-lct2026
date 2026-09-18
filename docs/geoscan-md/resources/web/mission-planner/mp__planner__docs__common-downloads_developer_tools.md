---
title: "DOWNLOADS: Developer Tools — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-downloads_developer_tools.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "5de7867e2d241862080830a9ca8fcbfd5ca747f9894d88ef08ca614b29c8860a"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [DOWNLOADS: Developer Tools — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-downloads_developer_tools.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="downloads-developer-tools"></a>

<a id="common-downloads-developer-tools"></a>

# DOWNLOADS: Developer Tools

The developer tools [can be downloaded from here](https://download.ardupilot.org/downloads/wiki/developer_tools/).

Note

Not all of these tools are “up to date”. For example, vehicle binaries and GCS software should be downloaded from their respective locations in the [firmware server](https://firmware.ardupilot.org/).

The rest of the article provides an overview of some of the files and the tool licensing.

<a id="tools"></a>

## Tools

<a id="odroid-ubuntu-14-04-hostapd"></a>

### Odroid Ubuntu 14.04 hostapd

- [hostapd\_OdroidU3\_Ubuntu1404.zip](https://download.ardupilot.org/downloads/wiki/developer_tools/hostapd_OdroidU3_Ubuntu1404.zip)

VERSION dev DATE POSTED January 20, 2015

This replaces the hostapd distributed with the Odroid U3 board’s Ubuntu 14.04. This newer version resolves issues creating a wifi access point.

<a id="arduino-code-to-test-an-airspeed-sensor"></a>

### Arduino code to test an airspeed sensor

- [Airspeed\_test.zip](https://download.ardupilot.org/downloads/wiki/developer_tools/Airspeed_test.zip)
- [Airspeed\_test1.zip](https://download.ardupilot.org/downloads/wiki/developer_tools/Airspeed_test1.zip)

DATE POSTED April 25, 2013

Arduino code to test an airspeed sensor

<a id="arduino-1-0-3-with-modifications-required-for-ardupilot-mac-os-x"></a>

### Arduino 1.0.3 with modifications required for ArduPilot (Mac OS X)

- [‘ArduPilot-Arduino-1.0.3-Mac.zip](https://download.ardupilot.org/downloads/wiki/developer_tools/ArduPilot-Arduino-1.0.3-Mac.zip)

DATE POSTED May 1, 2013

<a id="ardupilot-arduino-1-0-3-windows-zip"></a>

### ArduPilot-Arduino-1.0.3-windows.zip

- [ArduPilot-Arduino-1.0.3-windows.zip](https://download.ardupilot.org/downloads/wiki/developer_tools/ArduPilot-Arduino-1.0.3-windows.zip)

VERSION 1.0.3 DATE POSTED May 1, 2013

Arduino 1.0.3 with modifications required for ArduPilot

<a id="crosstrack-demo-flash-version"></a>

### CrossTrack demo (flash version)

- [CrossTrack.swf](https://download.ardupilot.org/downloads/wiki/developer_tools/CrossTrack.swf)

DATE POSTED April 29, 2013

<a id="data-dump-of-three-attitude-solutions"></a>

### Data dump of three attitude solutions

- [AttitudesThree.zip](https://download.ardupilot.org/downloads/wiki/developer_tools/AttitudesThree.zip)

DATE POSTED April 29, 2013

Data dump of 3 attitude solutions running in parallel. Includes README file.

– DCM – Madgwick filter\_mag – MPU6000 sensor fusion

<a id="declination-lookup-test-emm"></a>

### Declination Lookup - Test EMM

- [DeclinationLookup\_CompressedEMM-1.zip](https://download.ardupilot.org/downloads/wiki/developer_tools/DeclinationLookup_CompressedEMM-1.zip)

DATE POSTED April 29, 2013

This is a small zip file that contains 1 executable that is meant to be executed via the command line. When you run it you will see a menu with 4 options. The only option that will work is the declination lookup option. It is using the exact same lookup method as the AP\_Declination library I wrote except that the lookup tables were generated using the EMM (Enhanced) instead of the WMM.

<a id="mavproxybeta1-msi"></a>

### mavproxybeta1.msi

- [mavproxybeta1.msi](https://download.ardupilot.org/downloads/wiki/developer_tools/mavproxybeta1.msi)

DATE POSTED May 1, 2013

<a id="mavproxybetanoneworktest-msi"></a>

### mavproxyBetaNoNeworkTest.msi

- [mavproxyBetaNoNeworkTest.msi](https://download.ardupilot.org/downloads/wiki/developer_tools/mavproxyBetaNoNeworkTest.msi)

DATE POSTED May 1, 2013

<a id="serial-port-test-program"></a>

### Serial port test program

- [MultiSerialMega.zip](https://download.ardupilot.org/downloads/wiki/developer_tools/MultiSerialMega.zip)

DATE POSTED April 29, 2013

A little program that shows that Port 0 (USB) and Port 3 (Xbee) are working

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
