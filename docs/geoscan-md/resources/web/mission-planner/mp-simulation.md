---
title: "Mission Planner Simulation — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/mission-planner-simulation.html"
retrieved_at: "2026-09-15T18:09:54.449192+00:00"
source_sha256: "e91a7b2629cc8b972178285a6202ebbf0862e20ac6c640267af7f236ae701f01"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Mission Planner Simulation — Mission Planner  documentation](https://ardupilot.org/planner/docs/mission-planner-simulation.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="mission-planner-simulation"></a>

<a id="id1"></a>

# Mission Planner Simulation

The Simulation tab provides a SITL (Software in the Loop) simulation capability. Many typical frame types for each Vehicle type have been created. This allows you to see the expected behavior for vehicles in missions, or with a joystick attached, actually be able to fly/drive the vehicle simulation as if with RC. This allows you to see potential effects of parameter changes on vehicle behavior or explore mission generation, without risking your vehicle first.

Demonstration Video

<a id="setup-and-use"></a>

## Setup and Use

The Simulation uses the same SITL models as those used in the Linux `sim_vehicle.py` script (see [SITL Simulator (Software in the Loop)](https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html#sitl-simulator-software-in-the-loop), and uses the current master development branch of the code for firmware.

- Open Mission Planner’s **Simulation** tab.
- Choose your vehicle type and frame (the “Model” drop down box). First select the “Model” frame type, then click the vehicle it corresponds to. If no “Model” (frame) is selected, then a normal plane will be used no matter what vehicle is clicked. If a frame is selected and a vehicle clicked that does NOT correspond to it, undefined results may occur.
- Default parameters for that vehicle/frame will be loaded and the simulation started. Mission Planner can be used to control the vehicle, setup missions, alter parameters, etc.
- In addition to the normal vehicle parameters, you can also now see and change the “SIM\_x” (simulation) parameters via the CONFIG/Full Parameter Tree page. See [SITL Parameters](https://ardupilot.org/dev/docs/sitl-parameters.html#sitl-parameters) for a list of these.

<a id="extra-command-line"></a>

### Extra Command Line

The `Extra command line` box on the SIMULATION tab, you can start the SITL with various options:

Home Location : start simulation at any given location using the command `--home={location}` where location can be either gps coordinates,altitude ASL and vehicle initial heading, or a named location in the [Autotest locations file](https://github.com/ardupilot/ardupilot/blob/master/Tools/autotest/locations.txt)

```text
--home=CMAC
--home=-35.363261,149.165230,584,353
```

Different Default Parameter File: allows using a different default parameter file. If used in conjunctions with the `Wipe` checkbox (which wipes any previously changed parameters while running simulations on the chosen vehicle), these parameters will be loaded at simulation start. This avoids having to load and store any parameters desired to be changed for the simulation from the normal defaults.

```text
--defaults=<path to param file>   working dir is the sitl folder in Mission Planners documents folder
```

Attach a physical device to a SERIALx port in the sim: You can attach actual devices (GPS, RC, Rangefinder,etc.) to a Windows serial COM port and have it attached to a SERIALx port in the simulation for testing.

```text
--serialx=uart:COMy
```

Note

Although not shown in the above video, current version of Mission Plannner will ask if you want to simulate using the Development(master aka “latest”) or Stable version of the vehicle firmware when you click the vehicle to download the model and parameters and begin the simulation.

<a id="simulating-custom-code-branches"></a>

## Simulating Custom Code Branches

In addition, if you are code developer, you can run SITL using your custom code branch using Mission Planner, either with or without, the physics and visualizations of RealFlight. See the [Using Your Code Branch with Mission Planner SITL and RealFlightM](https://ardupilot.org/dev/docs/sitl-with-realflight.html#mp-sitl-custom-code) section of [Using SITL with RealFlight](https://ardupilot.org/dev/docs/sitl-with-realflight.html#sitl-with-realflight)
