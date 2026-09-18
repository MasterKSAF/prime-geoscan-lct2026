---
title: "Flight Data Screen Overview — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/mission-planner-ground-control-station.html"
retrieved_at: "2026-09-15T18:09:54.449192+00:00"
source_sha256: "070d837c9dbca8a0bf01c3d4b58968f426154b6989cd4614b6ccfba3f85ab408"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Flight Data Screen Overview — Mission Planner  documentation](https://ardupilot.org/planner/docs/mission-planner-ground-control-station.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="flight-data-screen-overview"></a>

<a id="mission-planner-ground-control-station"></a>

# Flight Data Screen Overview

<a id="overview"></a>

## Overview

The screenshot below shows the main “Heads-up Display (HUD)” view of the Mission Planner Ground Station. Once you have connected to a vehicle this screen will display the telemetry sent by ArduPilot.

 [[../_images/mp_hud_full.jpg](https://ardupilot.org/planner/_images/mp_hud_full.jpg)](https://ardupilot.org/planner/_images/mp_hud_full.jpg)

A more detailed view of the HUD (with legend) is given below.

 [[../_images/mp_hud_detail.jpg](https://ardupilot.org/planner/_images/mp_hud_detail.jpg)](https://ardupilot.org/planner/_images/mp_hud_detail.jpg)

1. Airspeed (Groundspeed if no airspeed sensor is fitted)
2. Crosstrack error and turn rate (T)
3. Heading direction
4. Bank angle
5. Telemetry connection link quality (averaged percentage of good packets)
6. GPS time
7. Altitude (Blue bar is the rate of climb)
8. Airspeed
9. Groundspeed
10. Battery status
11. Artificial Horizon
12. Aircraft Attitude
13. GPS Status
14. Distance to Waypoint \> Current Waypoint Number
15. Current Flight Mode

<a id="tips-for-using-the-flight-data-screen"></a>

### Tips for using the Flight Data screen

- The map will only show the current position when you have GPS lock or are using a flight simulator
- Remember how artificial horizons work: when the aircraft tilts to the right, the horizon tilts to the left. Just tilt your head and you will understand.
- You can issues mode changes and other action commands in the air with the Mission Planner and other GCSs, but note that you must be under autopilot control for them to take effect. When your RC toggle switch is in the Manual position, you are no longer under autopilot control and no commands will take effect. You must be in one of the other positions (Stabilize, Fly-by-Wire, Auto, or any other autopilot-controlled mode) for MAVLink commands to take effect.
- You can change the voice used in the speech synthesis in the Ease of Access center in Windows Control Panel. Go to the “Text to Speech” options.
- If you double-click the HUD it will popout, allowing you to run the HUD full screen on a second screen.
- Below the HUD are several buttons for actions, status, etc.
- If you enable the Tuning checkbox at the bottom of the map, and then double-click the tuning window that appears, you can graph any data that is available in the Status tab under the HUD. This means you can have alt, attitude, or many other options shown in real-time.
- You can use custom imagery instead of Google Maps. Press control-F. This allows you to upload your own orthophotos. This will require Globalmapper, as this is currently one of the key steps in exporting in the required format for use in the planner.

<a id="flight-data-screen-details"></a>

## Flight Data Screen Details

For more details about the Flight Data Screen, see:

- [Flight Data Screen Details](https://ardupilot.org/planner/docs/mission-planner-flight-data.html)

<a id="guided-mode"></a>

## Guided Mode

 [[../_images/mp_menu_fly_to_here.jpg](https://ardupilot.org/planner/_images/mp_menu_fly_to_here.jpg)](https://ardupilot.org/planner/_images/mp_menu_fly_to_here.jpg)

One of the most commonly-used features in pro UAVs is point-and-click mission control in real-time. Rather than just pre-planned missions or manually flying the UAV, operators can just click on a map and say “go here now” which is a feature available in Mission Planner.

On the Mission Planner Flight Data map, you can right-click on the map and just select “Fly To Here”. The UAV will fly there and loiter until you give it another command. ArduPilot calls this “Guided Mode”.

Note

Guided is a separate flight mode. If you enter it you will remain in it until you do something to change modes. So if you tell it to “go here now”, once it arrives there it will loiter at the Guided waypoint till you tell it to do something else. Something else could either be going to another Guided waypoint (staying in Guided mode) or changing to some other flight mode. If you change to Auto your mission will resume where it left off.

Note

[Go to this page](https://ardupilot.org/copter/docs/ac2_guidedmode.html#ac2-guidedmode) for a full description of how to use Guided Mode on Copter.
