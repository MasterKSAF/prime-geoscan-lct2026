---
title: "Download and Install | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/getting_started/download_and_install.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "015f8894f93c2823a6d17e2116422f6fa00ef0a5f1ac694abdc89fae9090fc7c"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Download and Install | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/getting_started/download_and_install.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="download-and-install"></a>

# Download and Install

The sections below can be used to download the [current stable release](https://github.com/mavlink/qgroundcontrol/releases) of *QGroundControl* for each platform.

TIP

See [Troubleshooting QGC Setup](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/qgc_setup.html) if *QGroundControl* doesn't start and run properly after installation!

<a id="system-requirements"></a>

## System Requirements

QGC should run well on any modern computer or mobile device. Performance will depend on the system environment, 3rd party applications, and available system resources. More capable hardware will provide a better experience. A computer with at least 8Gb RAM, an SSD, Nvidia or AMD graphics and an i5 or better CPU will be suitable for most applications.

For the best experience and compatibility, we recommend you the newest version of your operating system.

<a id="windows"></a>

## Windows

Supported versions: Windows 10 (1809 or later), Windows 11:

1. Download the installer:

   - [x86\_64](https://d176tv9ibo4jno.cloudfront.net/latest/QGroundControl-installer-AMD64.exe)
   - [Arm64](https://d176tv9ibo4jno.cloudfront.net/latest/QGroundControl-installer-ARM64.exe)
2. Double-click the executable to launch the installer.

INFO

The Windows installer creates 3 shortcuts: **QGroundControl**, **GPU Compatibility Mode**, **GPU Safe Mode**. Use the first shortcut unless you experience startup or video rendering issues. For more information see [Troubleshooting QGC Setup \> Windows: UI Rendering/Video Driver Issues](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/qgc_setup.html#opengl_troubleshooting).

<a id="macOS"></a>

## Mac OS

Supported versions: macOS 13 (Ventura) or later:

1. Download [QGroundControl.dmg](https://d176tv9ibo4jno.cloudfront.net/latest/QGroundControl.dmg).
2. Double-click the .dmg file to mount it. In the window that opens, drag the *QGroundControl* icon onto the *Applications* folder shortcut shown next to it.

INFO

The download is a universal binary that runs natively on both Apple Silicon and Intel Macs. Official builds are signed and notarized, so no Gatekeeper security overrides are needed to run the app.

<a id="ubuntu"></a>

## Ubuntu Linux

Supported versions: Ubuntu 24.04 LTS, 26.04 LTS:

INFO

The AppImage downloads below run on Ubuntu 24.04 LTS and 26.04 LTS. If you need a version of *QGroundControl* that runs on Ubuntu 22.04, it is possible, but you have to [build it yourself](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/getting_started/).

Ubuntu comes with a serial modem manager that interferes with any robotics related use of a serial port (or USB serial). Before installing *QGroundControl* you should remove the modem manager and grant yourself permissions to access the serial port.

**Before installing *QGroundControl* for the first time:**

1. Enable serial-port access Add your user to the dialout group so you can talk to USB devices without root:

```text
sudo usermod -aG dialout "$(id -un)"
```

INFO

At login, your shell takes a snapshot of your user and group memberships. Because you just changed groups, you need a fresh login shell to pick up “dialout” access. Logging out and back in reloads that snapshot, so you get the new permissions.

1. (Optional) Disable ModemManager On some Ubuntu-based systems, ModemManager can claim serial ports that QGC needs. If you don't use it elsewhere, mask or remove it.

```text
# preferred: stop and mask the service
sudo systemctl mask --now ModemManager.service

# or, if you’d rather remove the package
sudo apt remove --purge modemmanager
```

1. On the command prompt, enter:

sh

```text
sudo apt install -y libfuse2 libxcb-xinerama0 libxkbcommon-x11-0 libxcb-cursor0
```

**To install *QGroundControl*:**

1. Download the AppImage for your architecture:

   - [Linux x86\_64](https://d176tv9ibo4jno.cloudfront.net/latest/QGroundControl-x86_64.AppImage)
   - [Linux aarch64](https://d176tv9ibo4jno.cloudfront.net/latest/QGroundControl-aarch64.AppImage)
2. Make the AppImage executable

```text
chmod +x QGroundControl-<arch>.AppImage
```

1. Run QGroundControl Either double-click the AppImage in your file manager or launch it from a terminal:

```text
./QGroundControl-<arch>.AppImage
```

<a id="android"></a>

## Android

Supported versions: Android 9 (API 28) or later (arm 32/64):

- [Android APK](https://d176tv9ibo4jno.cloudfront.net/latest/QGroundControl.apk)

::: important The version of Qt used by QGroundControl requires Android 9 (API 28) as the minimum supported version. It is not possible to support older Android releases. This means that some integrated controllers running older versions of Android are no longer compatible with current builds of QGroundControl. QGroundControl 5.0 stable is the last release that supports these older devices. Note that 5.0 may not fully support firmware versions released after it, so users on older controllers may experience limited compatibility with newer autopilot firmware. :::

<a id="old-stable-releases"></a>

## Old Stable Releases

Old stable releases can be found on [GitHub](https://github.com/mavlink/qgroundcontrol/releases/).
