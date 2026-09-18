---
title: "Installing Mission Planner — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/mission-planner-installation.html"
retrieved_at: "2026-09-15T18:07:34.513884+00:00"
source_sha256: "5f88ee3bb46d9a898edbbfa59139d602e1226994310a72b4fb32f40ccfdaf92e"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Installing Mission Planner — Mission Planner  documentation](https://ardupilot.org/planner/docs/mission-planner-installation.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="installing-mission-planner"></a>

<a id="install-mission-planner"></a>

# Installing Mission Planner

Mission Planner was designed for native Windows installation. However, it is possible to use it under Linux (with some occasional issues) and there is a Beta version for Android OS.

<a id="windows-installation"></a>

## Windows Installation

The following instructions show how to install *Mission Planner* on Windows. These instructions will be suitable for most users. For advanced users and non-standard installations, instructions are found [here:](https://ardupilot.org/planner/docs/mission-planner-advanced-installation.html#mission-planner-advanced-installation). A useful video guide for advanced installation of *Mission Planner* is located [here](https://youtu.be/cw7adeD1yeg).

- Download the [latest Mission Planner installer from here](https://firmware.ardupilot.org/Tools/MissionPlanner/MissionPlanner-latest.msi)
- Double click on the downloaded **.msi** file to run the installer

   [[../_images/mp_installation.png](https://ardupilot.org/planner/_images/mp_installation.png)](https://ardupilot.org/planner/docs/_images/mp_installation.png)
- Follow the instructions to complete the setup process. The installation utility will automatically install any necessary software drivers. If you receive a DirectX installation error, please update your DirectX plug-in from the [Windows Download Center](https://www.microsoft.com/en-us/download/windows.aspx).
- If you receive the warning pictured below, select **Install this driver software anyway** to continue.

   [[../_images/driver_installation_warning.png](https://ardupilot.org/planner/_images/driver_installation_warning.png)](https://ardupilot.org/planner/_images/driver_installation_warning.png)

Mission Planner is normally installed in the **C:\\Program Files (x86)\\Mission Planner** folder.

An icon to open the *Mission Planner* is created according to your instructions during the installation.

<a id="open-mission-planner"></a>

### Open Mission Planner

Once installation is complete, open *Mission Planner* by clicking on its system icon.

Then you can either:

- [Connect Mission Planner to AutoPilot](https://ardupilot.org/planner/docs/common-connect-mission-planner-autopilot.html#common-connect-mission-planner-autopilot) in order to receive telemetry and control the vehicle OR
- [Load Firmware](https://ardupilot.org/planner/docs/common-loading-firmware.html#common-loading-firmware) OR [plan autonomous missions](https://ardupilot.org/planner/docs/common-mission-planning.html#common-mission-planning).

<a id="updating-mission-planner"></a>

### Updating Mission Planner

*Mission Planner* automatically notifies you about available updates (when it is connected to the Internet).

Please always run the most current version of Mission Planner.

- [Mission Planner Advanced Installation](https://ardupilot.org/planner/docs/mission-planner-advanced-installation.html)

<a id="mission-planner-on-android"></a>

## Mission Planner on Android

A version for Android is in development and can be downloaded from the [Google Play Store here](https://play.google.com/store/apps/details?id=com.michaeloborne.MissionPlanner).

The latest version is also available [here](https://github.com/ArduPilot/MissionPlanner/releases/tag/latest). Download to device, and double click on it to install.

<a id="mission-planner-on-linux"></a>

## Mission Planner on Linux

It is possible to run most Windows based programs on many Linux Distributions using MONO. Mission Planner does run under MONO but will have occasional issues and/or crashes. QGC and MAVProxy are alternatives that run stably in Linux, but if Mission Planner is really desired, you can follow these steps:

- Download and install the latest version of MONO from [here](https://www.mono-project.com/download/stable/)
- Download Mission Planner as a zip file from [here](https://firmware.ardupilot.org/Tools/MissionPlanner/MissionPlanner-latest.zip) and unzip to a directory.
- Change to that directory and execute:

  > ```text
  > mono MissionPlanner.exe
  > ```

Note

**Zorin OS users:** If you see errors with .exe files during build, run:

```text
sudo apt install mono-complete
```
