---
title: "Flight Modes — Copter  documentation"
source_url: "https://ardupilot.org/copter/docs/flight-modes.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "bc2779f47d529d78e22bb5eee7523a701d225d3b553df67f23274ee39aae2387"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Flight Modes — Copter  documentation](https://ardupilot.org/copter/docs/flight-modes.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="flight-modes"></a>

<a id="id1"></a>

# Flight Modes

This article provides an overview and links to the available flight modes for Copter.

<a id="overview"></a>

## Overview

Copter has 25 flight built-in flight modes, 10 of which are regularly used. There are modes to support different levels/types of flight stabilization, a sophisticated autopilot, a follow-me system etc.

Flight modes are controlled through the radio (via a [transmitter switch](https://ardupilot.org/copter/docs/common-rc-transmitter-flight-mode-configuration.html#common-rc-transmitter-flight-mode-configuration)), via mission commands, or using commands from a ground station (GCS) or companion computer.

The table below shows for each flight mode whether it provides altitude or position control, and whether it requires valid position information from a sensor (typically a GPS) in order to arm or switch into this mode. Position Control also requires a compass for good performance. In addition ALT\_HOLD requires an altitude sensor.

| Mode | Alt Ctrl | Pos Ctrl | Pos Sensor | Summary |
| --- | --- | --- | --- | --- |
| Acro | - | - |  | Holds attitude, no self-level |
| Airmode | - | -/+ |  | Actually not a mode, but a feature,see below |
| Alt Hold | s | + |  | Holds altitude and self-levels the roll & pitch |
| Auto | A | A | Y | Executes pre-defined mission |
| AutoTune | s | A | Y | Automated pitch and bank procedure to improve control loops |
| Brake | A | A | Y | Brings copter to an immediate stop |
| Circle | s | A | Y | Automatically circles a point in front of the vehicle |
| Drift | - | + | Y | Like stabilize, but coordinates yaw with roll like a plane |
| Flip | A | A |  | Rises and completes an automated flip |
| FlowHold | s | A |  | Position control using Optical Flow |
| Follow | s | A | Y | Follows another vehicle |
| Guided | A | A | Y | Navigates to single points commanded by GCS |
| Heli\_Autorotate | A | A | Y | Used for emergencies in traditional helicopters. Helicopter only. Currently SITL only. |
| Land | A | s | (Y) | Reduces altitude to ground level, attempts to go straight down |
| Loiter | s | s | Y | Holds altitude and position, uses GPS for movements |
| PosHold | s | + | Y | Like loiter, but manual roll and pitch when sticks not centered |
| RTL | A | A | Y | Returns above takeoff location, may also include landing |
| Simple/Super Simple |  |  | Y | An add-on to flight modes to use pilot's view instead of yaw orientation |
| SmartRTL | A | A | Y | RTL, but traces path to get home |
| Sport | s | s |  | Alt-hold, but holds pitch & roll when sticks centered |
| Stabilize | - | + |  | Self-levels the roll and pitch axis |
| SysID | - | + |  | Special diagnostic/modeling mode |
| Throw | A | A | Y | Holds position after a throwing takeoff. Multirotors only. |
| Turtle | - | - |  | Allows reversing and spinning up adjacent pairs of motors in order to flip a crashed, inverted vehicle back upright. Multirotors only. |
| ZigZag | A | A | Y | Useful for crop spraying |

| Symbol | Definition |
| --- | --- |
| - | Manual control |
| + | Manual control with limits & self-level |
| s | Pilot controls rate of changes |
| A | Automatic control |

<a id="recommended-flight-modes"></a>

## Recommended Flight Modes

In general when first starting to use Copter you should progress through the flight modes in the order listed below, being sure that you are comfortable with each before progressing to the next (click the links for more details):

- [Stabilize](https://ardupilot.org/copter/docs/stabilize-mode.html#stabilize-mode)
- [Alt Hold](https://ardupilot.org/copter/docs/altholdmode.html#altholdmode)
- [Loiter](https://ardupilot.org/copter/docs/loiter-mode.html#loiter-mode)
- [RTL (Return-to-Launch)](https://ardupilot.org/copter/docs/rtl-mode.html#rtl-mode)
- [Auto](https://ardupilot.org/copter/docs/auto-mode.html#auto-mode)

Additional flight modes:

- [Acro](https://ardupilot.org/copter/docs/acro-mode.html#acro-mode)
- [AirMode](https://ardupilot.org/copter/docs/airmode.html#airmode)
- [Heli\_Autorotate](https://ardupilot.org/copter/docs/traditional-helicopter-autorotation-mode.html#traditional-helicopter-autorotation-mode) for traditional helicopters only.
- [AutoTune](https://ardupilot.org/copter/docs/autotune.html#autotune)
- [Brake](https://ardupilot.org/copter/docs/brake-mode.html#brake-mode)
- [Circle](https://ardupilot.org/copter/docs/circle-mode.html#circle-mode)
- [Drift](https://ardupilot.org/copter/docs/drift-mode.html#drift-mode)
- [Flip](https://ardupilot.org/copter/docs/flip-mode.html#flip-mode)
- [FlowHold](https://ardupilot.org/copter/docs/flowhold-mode.html#flowhold-mode)
- [Follow](https://ardupilot.org/copter/docs/follow-mode.html#follow-mode)
- [Guided](https://ardupilot.org/copter/docs/ac2_guidedmode.html#ac2-guidedmode) (and [Guided\_NoGPS](https://ardupilot.org/copter/docs/ac2_guidedmode.html#guided-nogps))
- [Land](https://ardupilot.org/copter/docs/land-mode.html#land-mode)
- [PosHold](https://ardupilot.org/copter/docs/poshold-mode.html#poshold-mode)
- [Sport](https://ardupilot.org/copter/docs/sport-mode.html#sport-mode)
- [Throw](https://ardupilot.org/copter/docs/throw-mode.html#throw-mode) for multirotors only.
- [Follow Me](https://ardupilot.org/copter/docs/ac2_followme.html#ac2-followme)
- [Simple and Super Simple](https://ardupilot.org/copter/docs/simpleandsuper-simple-modes.html#simpleandsuper-simple-modes)
- [Smart RTL (Return-to-Launch)](https://ardupilot.org/copter/docs/smartrtl-mode.html#smartrtl-mode)
- [SysID (System Identification)](https://ardupilot.org/copter/docs/common-systemid-mode.html#common-systemid-mode)
- [Turtle](https://ardupilot.org/copter/docs/turtle-mode.html#turtle-mode) for multirotors only.
- [ZigZag](https://ardupilot.org/copter/docs/zigzag-mode.html#zigzag-mode)
- [Avoid\_ADSB](https://ardupilot.org/copter/docs/common-ads-b-receiver.html#common-ads-b-receiver) for ADS-B based avoidance of manned aircraft. Should not be set-up as a pilot selectable flight mode.

Most transmitters provide a 3 position switch but you can find instructions [here for setting up a 6-position flight mode switch](https://ardupilot.org/copter/docs/common-rc-transmitter-flight-mode-configuration.html#common-rc-transmitter-flight-mode-configuration).

<a id="gps-dependency"></a>

## GPS Dependency

Flight modes that use positioning data require valid position identification prior to takeoff. When using GPS, to verify if your autopilot has acquired GPS lock, connect to a ground station or consult your autopilot’s hardware overview page to see the LED indication for GPS lock.

Below is a summary of position identification dependency for Copter flight modes. Most often this position information is obtained via a GPS, but other position sensors, such as 3D cameras or beacons, may be used and would need to provide a valid location, for those modes requiring it, prior to arming.

Requires valid position prior to takeoff:

- [Auto](https://ardupilot.org/copter/docs/auto-mode.html#auto-mode)
- [Heli\_Autorotate](https://ardupilot.org/copter/docs/traditional-helicopter-autorotation-mode.html#traditional-helicopter-autorotation-mode)
- [Circle](https://ardupilot.org/copter/docs/circle-mode.html#circle-mode)
- [Drift](https://ardupilot.org/copter/docs/drift-mode.html#drift-mode)
- [Follow](https://ardupilot.org/copter/docs/follow-mode.html#follow-mode)
- [Follow Me](https://ardupilot.org/copter/docs/ac2_followme.html#ac2-followme)
- [Guided](https://ardupilot.org/copter/docs/ac2_guidedmode.html#ac2-guidedmode)
- [Loiter](https://ardupilot.org/copter/docs/loiter-mode.html#loiter-mode)
- [PosHold](https://ardupilot.org/copter/docs/poshold-mode.html#poshold-mode)
- [RTL (Return-to-Launch)](https://ardupilot.org/copter/docs/rtl-mode.html#rtl-mode)
- [Smart RTL (Return-to-Launch)](https://ardupilot.org/copter/docs/smartrtl-mode.html#smartrtl-mode)
- [Throw](https://ardupilot.org/copter/docs/throw-mode.html#throw-mode)
- [ZigZag](https://ardupilot.org/copter/docs/zigzag-mode.html#zigzag-mode)

Do not require position information:

- [Acro](https://ardupilot.org/copter/docs/acro-mode.html#acro-mode)
- [AirMode](https://ardupilot.org/copter/docs/airmode.html#airmode)
- [Alt Hold](https://ardupilot.org/copter/docs/altholdmode.html#altholdmode)
- [Stabilize](https://ardupilot.org/copter/docs/stabilize-mode.html#stabilize-mode)
- [Sport](https://ardupilot.org/copter/docs/sport-mode.html#sport-mode)
- [SysID](https://ardupilot.org/copter/docs/common-systemid-mode.html#common-systemid-mode)
- [Turtle](https://ardupilot.org/copter/docs/turtle-mode.html#turtle-mode)
- [Land](https://ardupilot.org/copter/docs/land-mode.html#land-mode)

<a id="full-list-of-flight-modes"></a>

## Full list of flight modes

- [Acro](https://ardupilot.org/copter/docs/acro-mode.html)
- [Altitude Hold](https://ardupilot.org/copter/docs/altholdmode.html)
- [AirMode](https://ardupilot.org/copter/docs/airmode.html)
- [Auto](https://ardupilot.org/copter/docs/auto-mode.html)
- [Brake](https://ardupilot.org/copter/docs/brake-mode.html)
- [Circle](https://ardupilot.org/copter/docs/circle-mode.html)
- [Drift](https://ardupilot.org/copter/docs/drift-mode.html)
- [Flip](https://ardupilot.org/copter/docs/flip-mode.html)
- [FlowHold](https://ardupilot.org/copter/docs/flowhold-mode.html)
- [Follow](https://ardupilot.org/copter/docs/follow-mode.html)
- [Follow Me (GCS Enabled)](https://ardupilot.org/copter/docs/ac2_followme.html)
- [Guided](https://ardupilot.org/copter/docs/ac2_guidedmode.html)
- [Heli\_Autorotate](https://ardupilot.org/copter/docs/traditional-helicopter-autorotation-mode.html)
- [Land](https://ardupilot.org/copter/docs/land-mode.html)
- [Loiter](https://ardupilot.org/copter/docs/loiter-mode.html)
- [PosHold](https://ardupilot.org/copter/docs/poshold-mode.html)
- [RTL](https://ardupilot.org/copter/docs/rtl-mode.html)
- [Simple and Super Simple](https://ardupilot.org/copter/docs/simpleandsuper-simple-modes.html)
- [Smart RTL (Return-to-Launch)](https://ardupilot.org/copter/docs/smartrtl-mode.html)
- [Sport](https://ardupilot.org/copter/docs/sport-mode.html)
- [Stabilize](https://ardupilot.org/copter/docs/stabilize-mode.html)
- [System Identification](https://ardupilot.org/copter/docs/common-systemid-mode.html)
- [Throw](https://ardupilot.org/copter/docs/throw-mode.html)
- [Turtle](https://ardupilot.org/copter/docs/turtle-mode.html)
- [ZigZag](https://ardupilot.org/copter/docs/zigzag-mode.html)
