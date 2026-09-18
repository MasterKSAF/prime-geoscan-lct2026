---
title: "SITL Simulator (Software in the Loop) — Dev  documentation"
source_url: "https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "75b7ec6c963464dfe7c752fdd8020d5101e96646b634785cc041db6613a6823f"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [SITL Simulator (Software in the Loop) — Dev  documentation](https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="sitl-simulator-software-in-the-loop"></a>

<a id="id1"></a>

# SITL Simulator (Software in the Loop)

[../_images/sitl.jpg](https://ardupilot.org/dev/_images/sitl.jpg)

The SITL (software in the loop) simulator allows you to run Plane, Copter or Rover without any hardware. It is a build of the autopilot code using an ordinary C++ compiler, giving you a native executable that allows you to test the behaviour of the code without hardware.

This article provides an overview of SITL’s benefits and architecture.

<a id="overview"></a>

## Overview

SITL allows you to run ArduPilot on your PC directly, without any special hardware. It takes advantage of the fact that ArduPilot is a portable autopilot that can run on a very wide variety of platforms. Your PC is just another platform that ArduPilot can be built and run on.

When running in SITL the sensor data comes from a flight dynamics model in a flight simulator. ArduPilot has a wide range of vehicle simulators built in, and can interface to several external simulators. This allows ArduPilot to be tested on a very wide variety of vehicle types. For example, SITL can simulate:

- multi-rotor aircraft
- fixed wing aircraft
- ground vehicles
- underwater vehicles
- camera gimbals
- antenna trackers
- a wide variety of optional sensors, such as Lidars and optical flow sensors

Adding new simulated vehicle types or sensor types is straightforward.

A big advantage of ArduPilot on SITL is it gives you access to the full range of development tools available to desktop C++ development, such as interactive debuggers, static analyzers and dynamic analysis tools. This makes developing and testing new features in ArduPilot much simpler.

<a id="running-sitl"></a>

## Running SITL

The ArduPilot SITL environment has been developed to run natively on both Linux and Windows. For setup instructions see [Setting Up SITL](https://ardupilot.org/dev/docs/SITL-setup-landingpage.html#sitl-setup-landingpage) for more information. Using SITL is explained in [Using SITL](https://ardupilot.org/dev/docs/using-sitl-for-ardupilot-testing.html#using-sitl-for-ardupilot-testing). For examples of starting and using SITL for a particular vehicle see [Examples of using SITL by Vehicle](https://ardupilot.org/dev/docs/sitl-examples.html#sitl-examples).

Mission Planner (Windows) also provides a simple means of running SITL for the master branch and stable branches of vehicles. See [Mission Planner Simulation](https://ardupilot.org/planner/docs/mission-planner-simulation.html#mission-planner-simulation).

<a id="sitl-architecture"></a>

## SITL Architecture

Note in the image below the port numbers are indicative only and can vary. For instance the ports between ArduPilot and the simulator on the image are 5501/5502 but they can vary to be 5504/5505 or other port numbers depending on your environment.

 [[../_images/ArdupilotSoftwareintheLoopSITL.jpg](https://ardupilot.org/dev/_images/ArdupilotSoftwareintheLoopSITL.jpg)](https://ardupilot.org/dev/_images/ArdupilotSoftwareintheLoopSITL.jpg)

- [Setting Up SITL](https://ardupilot.org/dev/docs/SITL-setup-landingpage.html)
- [Running SITL on the Autopilot Itself](https://ardupilot.org/dev/docs/sim-on-hardware.html)
- [Using SITL](https://ardupilot.org/dev/docs/using-sitl-for-ardupilot-testing.html)
- [Examples of using SITL by Vehicle](https://ardupilot.org/dev/docs/sitl-examples.html)
- [SITL Serial Ports](https://ardupilot.org/dev/docs/learning-ardupilot-uarts-and-the-console.html)
- [SITL Parameter List](https://ardupilot.org/dev/docs/sitl-parameters.html)
