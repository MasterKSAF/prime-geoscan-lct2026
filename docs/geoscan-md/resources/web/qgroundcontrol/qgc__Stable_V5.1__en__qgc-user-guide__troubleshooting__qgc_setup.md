---
title: "Troubleshooting QGC Setup | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/qgc_setup.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "4410212ec6ab2964ff5f500b96b360c4745dd8ec852cb8733e4aa68c3a3a01a3"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Troubleshooting QGC Setup | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/qgc_setup.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="troubleshooting-qgc-setup"></a>

# Troubleshooting QGC Setup

This topic lists troubleshooting information related to *QGroundControl* setup and installation on the host computer.

TIP

Problems when **using** *QGroundControl* to interact with a vehicle are covered in: [QGC Vehicle Interaction Problems](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/qgc_usage.html).

<a id="opengl_troubleshooting"></a>

## Windows: UI Rendering/Video Driver Issues

If you experience UI rendering issues or video driver crashes on Windows, this may be caused by "flaky" OpenGL drivers. *QGroundControl* provides 3 shortcuts that you can use to start *QGroundControl* in "safer" video modes (try these in order):

- **QGroundControl:** QGC uses OpenGL graphics drivers directly.
- **GPU Compatibility Mode:** QGC uses ANGLE drivers, which implement OpenGL on top of DirectX.
- **GPU Safe Mode:** QGC uses a software rasterizer for the UI (this is very slow).

<a id="waiting_for_connection"></a>

## Windows: Doesn't connect to Vehicle over WiFi

If *QGroundControl* sits forever (for example, *Waiting For Vehicle Connection*) when trying to connect to the vehicle over Wifi, a possible cause is that IP traffic is being blocked by firewall software (e.g. Windows Defender, Norton, etc.).

The solution is to allow the *QGroundControl* app through the firewall.

INFO

It is possible to simply switch the network profile from Public to Private to allow connections, but this exposes your PC to the Network, so be careful

If using *Windows Defender*:

- In the **Start** bar, enter/select: *Firewall & Network Protection* (System Settings).
- Scroll to and select the option: *Allow an app through firewall*.
- Select *QGroundControl* and change the *Access* selector to **Allow**.

  TIP

  Programs are listed in alphabetical order by description (not filename). You'll find QGC under **O**: *Open source ground control app provided by QGroundControl dev team*

<a id="missing_gstreamer"></a>

## Ubuntu: Video Streaming Fails (Missing Gstreamer)

On Ubuntu you must install *Gstreamer* components in order to see video streams. If these are not installed *QGroundControl* is unable to create the gstreamer nodes and fails with:

sh

```text
VideoReceiver::start() failed. Error with gst_element_factory_make(‘avdec_h264’)
```

The [download/install instructions for Ubuntu](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/getting_started/download_and_install.html#ubuntu) include *GStreamer* setup information.

<a id="dual_vga"></a>

## Ubuntu 18.04: Video Streaming Fails on Dual Video Adapter Systems

The version of GStreamer in Ubuntu 18.04 has a bug that prevents video displaying when using a VA API based decoder (i.e. vaapih264dec etc.) on systems that have both Intel and NVidia video display adapters.

INFO

More generally, while the problem is known to occur on Ubuntu 18.04 with Intel and NVidia VGAs, it might occur on any linux system and other types of (dual) VGAs.

The easiest way to get *QGroundControl* to work in this case is to start it using the following command line:

sh

```text
LIBVA_DRIVER_NAME=fakedriver ./QGroundControl
```

Other alternatives are to disable one of the VGAs, uninstall VA API components, or upgrade to GStreamer 1.16 (there is no easy way to do this on Ubuntu 18.04 - please contribute a recipe if you find one!)
