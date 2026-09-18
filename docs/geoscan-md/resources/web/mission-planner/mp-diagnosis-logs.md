---
title: "Diagnosing some common problems using Logs — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-diagnosing-problems-using-logs.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "5606bec5d1247f73ff9148794caf7e8963e5444eb117a1d48f4381cd01a748ab"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Diagnosing some common problems using Logs — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-diagnosing-problems-using-logs.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="diagnosing-some-common-problems-using-logs"></a>

<a id="common-diagnosing-problems-using-logs"></a>

# Diagnosing some common problems using Logs

This page show how to diagnose the six most common problems affecting Copter in particular but to some extent Plane and Rover as well.

<a id="mechanical-failures"></a>

<a id="common-diagnosing-problems-using-logs-mechanical-failures"></a>

## Mechanical Failures

Common mechanical failures include a motor or ESC failure ([including ESC sync failures](https://www.youtube.com/watch?v=hBUBbeyLe0Q)), the propeller breaking or coming off, etc. These appear in the log as a sudden divergence in the desired roll and pitch vs the vehicle’s actual roll and pitch. This divergence is visible by graphing the ATT message’s DesRoll vs Roll, DesPitch vs Pitch and to a lesser extent DesYaw vs Yaw.

 [[../_images/DiagnosingWithLogs_RollInVsRoll.png](https://ardupilot.org/planner/_images/DiagnosingWithLogs_RollInVsRoll.png)](https://ardupilot.org/planner/_images/DiagnosingWithLogs_RollInVsRoll.png)

In the example above the vehicle’s actual roll (“Roll”) closely follows the desired roll (“DesRoll”) for the first part of the log but then suddenly diverges. The autopilot wanted the roll to remain level (“Roll” = 0) but it was unable to likely meaning there was a mechanical failure. This is very different from a software failure in which the autopilot freaked out and for some strange reason suddenly wanted the copter up-side-down because in such cases the DesRoll would be also be crazy and actual Roll would follow.

Tlogs contain the same data. Compare NAV\_CONTROLLER\_OUTPUT’s nav\_roll (desired roll) and nav\_pitch (desired pitch) to ATTITUDE.roll (actual roll) and pitch (actual pitch).

<a id="vibrations"></a>

<a id="common-diagnosing-problems-using-logs-vibrations"></a>

## Vibrations

High vibrations can cause the Copter’s accelerometer based altitude and horizontal position estimates to drift far off from reality which leads to problems with altitude hold (the vehicle may rocket into the sky) or position control in modes like Loiter, PosHold, Auto, etc.

As covered on the [Measuring Vibration](https://ardupilot.org/planner/docs/common-measuring-vibration.html#common-measuring-vibration) page, vibrations are best viewed by graphing the **VIBE** message’s **VibeX**, **VibeY** and **VibeZ** values. Vibration levels below 30m/s/s are normally acceptable. Levels above 30m/s/s may have problems and levels above 60m/s/s nearly always have problems with position or altitude hold.

The below graph shows acceptable vibration levels which are consistently below 30m/s/s

 [[../_images/mp_vibe_dataflash_msg.png](https://ardupilot.org/planner/_images/mp_vibe_dataflash_msg.png)](https://ardupilot.org/planner/_images/mp_vibe_dataflash_msg.png)

The graph below is from a vehicle that had position estimation problems due to high vibrations

 [[../_images/mp_measuring_vibration_bad_vibes.png](https://ardupilot.org/planner/_images/mp_measuring_vibration_bad_vibes.png)](https://ardupilot.org/planner/_images/mp_measuring_vibration_bad_vibes.png)

Tlog’s VIBRATION **vibration\_x**, **vibration\_y** and **vibration\_z** can also be used and show the same information as is stored to the dataflash log

 [[../_images/DiagnosingWithLogs_VibesTlog.png](https://ardupilot.org/planner/_images/DiagnosingWithLogs_VibesTlog.png)](https://ardupilot.org/planner/_images/DiagnosingWithLogs_VibesTlog.png)

<a id="compass-interference"></a>

<a id="common-diagnosing-problems-using-logs-compass-interference"></a>

## Compass interference

Interference from the power distribution board, motors, battery, ESCs and other electrical devices near the autopilot can throw off the compass heading which can lead to circling (aka “toilet bowling”) or even the copter flying off in completely the wrong direction. Graphing the tlog’s mag\_field (found under “CUSTOM”) and throttle (found under VFR\_HUD) is the easiest way to quickly see the amount of interference.

The graph below shows an acceptable amount of magnetic interference with mag\_field fluctuations of only 10% to 20% when the throttle is raised. Below 30% interference is acceptable. Between 30% ~ 60% is in the grey zone where it might be OK (some users are OK, some are not) and really bad magnetic interference will show up as jumps of over 60% when the throttle is raised.

 [[../_images/DiagnosingWithLogs_MagFieldVsThr.png](https://ardupilot.org/planner/_images/DiagnosingWithLogs_MagFieldVsThr.png)](https://ardupilot.org/planner/_images/DiagnosingWithLogs_MagFieldVsThr.png)

Extra Notes:

- The length of the mag\_field can be anywhere from 120 ~ 550 depending upon where in the world the vehicle is but it is normally around 330
- The magnetic interference as a percentage of the total mag field is also displayed at the end of the compassmot set-up procedure. Search for “CompassMot” on the [Advanced Compass Setup page](https://ardupilot.org/sub/docs/common-compass-setup-advanced.html#common-compass-setup-advanced) page to learn more about compassmot
- Dataflash log’s COMPASS message hold the compass’s raw x, y and z axis values (called MagX, MagY, MagZ) which are equivalent to the tlog’s RAW\_IMU xmag, ymag and zmag fields. It is possible to calculate the mag-field length by first loading the dataflash log file into excel, filtering by the COMPASS message and then calculating the mag-field using the formula mag\_field = sqrt(MagX^2, MagY^2, MagZ^2). Note that the COMPASS message is not enabled by default in the dataflash logs because it runs at 50hz and does affect CPU performance a bit.
- The image above it shows a short spike at the beginning of the graph but this can be ignored because it is before the throttle is raised so it is probably just as the user plugged in some other electrical device

<a id="gps-glitches"></a>

<a id="common-diagnosing-problems-using-logs-gps-glitches"></a>

## GPS glitches

When in autonomous modes (Loiter, RTL, Auto, etc) position errors from the GPS can cause the vehicle to think that it is suddenly in the wrong place and lead to aggressive flying to correct the perceived error. These “glitches” show up in both the tlogs and dataflash logs as a decrease in the number of satellites visible and an increase in the [hdop](https://en.wikipedia.org/wiki/Dilution_of_precision_%28GPS%29).

Graph the Dataflash log’s GPS message’s “HDop” and “NSats” values. Hdop values below 1.5 are very good, values over 2.0 could indicate the GPS positions are not good. The number of satellites falling below 12 is also bad. A significant change in these two values often accompanies a GPS position change.

 [[../_images/DisagnosingWithLogs_GPShdopAndNumSats_DF.png](https://ardupilot.org/planner/_images/DisagnosingWithLogs_GPShdopAndNumSats_DF.png)](https://ardupilot.org/planner/_images/DisagnosingWithLogs_GPShdopAndNumSats_DF.png)

If using tlogs graph the GPS\_RAW\_IT group’s “eph” and “satellites\_visible” values. Hdop values below 150 are good, values over 200 could indicate a bad position.

 [[../_images/DisagnosingWithLogs_GPShdopAndNumSats.png](https://ardupilot.org/planner/_images/DisagnosingWithLogs_GPShdopAndNumSats.png)](https://ardupilot.org/planner/_images/DisagnosingWithLogs_GPShdopAndNumSats.png)

See the [EKF failsafe](https://ardupilot.org/copter/docs/common-ekf-inav-failsafe.html#ekf-inav-failsafe) wiki page for more details on how the vehicle may switch to non-autonomous modes in the case of very bad GPS glitches

<a id="power-problems-brownouts-etc"></a>

## Power Problems (BrownOuts, etc)

[Power Modules](https://ardupilot.org/sub/docs/common-powermodule-landingpage.html#common-powermodule-landingpage) provide a reliable power supply to the autopilot but brown-outs do still occasionally occur. They can normally be recognised by the logs suddenly ending while the vehicle is still in the air (i.e. barometer or EKF altitude is still reporting the vehicle’s altitude is well above zero).

Try graphing the:

- Dataflash log’s CTUN Alt (altitude above home) or BAlt (Barometer altitude)
- Dataflash log’s GPS Alt (altitude above sea level)
- Tlog’s VFR\_HUD alt (the combined accelerometer + barometer altitude estimate)
- Tlog’s GLOBAL\_POSITION relative\_alt (altitude above home)

 [[../_images/DiagnosingWithLogs_BrownOut.png](https://ardupilot.org/planner/_images/DiagnosingWithLogs_BrownOut.png)](https://ardupilot.org/planner/_images/DiagnosingWithLogs_BrownOut.png)

Changes in the board voltage can also be a sign of a power problem. Variations of 0.10 to 0.15 volts are normal. Beyond that could be a sign that other devices sharing the power source with the autopilot are causing ripples in the power supply that could lead to a brown-out. The board voltage can be graphed using:

- Dataflash POWR message’s VCC
- Tlog HWSTATUS’s Vcc

In the image directly below shows the board voltage sinking by 0.15V when the throttle is raised. This is generally not a good thing but because it’s only 0.15V it’s probably OK. The 2nd graph below (a dataflash graph from a different user’s log) shows a very stable voltage with ripples less than 0.1V.

 [[../_images/DiagnosingWithLogs_BoardVccVsThr.png](https://ardupilot.org/planner/_images/DiagnosingWithLogs_BoardVccVsThr.png)](https://ardupilot.org/planner/_images/DiagnosingWithLogs_BoardVccVsThr.png)  [[../_images/DiagnosingWithLogs_DataFlashBoardVcc.png](https://ardupilot.org/planner/_images/DiagnosingWithLogs_DataFlashBoardVcc.png)](https://ardupilot.org/planner/_images/DiagnosingWithLogs_DataFlashBoardVcc.png)

<a id="unexpected-errors-including-failsafes"></a>

## Unexpected ERRORS including Failsafes

When unexpected behaviour from the autopilot occurs (especially when the user complains that the copter no longer responded to their input) it is often caused by one of the [failsafes](https://ardupilot.org/copter/docs/failsafe-landing-page.html#failsafe-landing-page) being triggered.

The easiest way to find these is to look in the dataflash logs and filter the first column by “ERR”. If using the Mission Planner, the errors will also appear in red markers at the top of the graphing area.

 [[../_images/DiagnosingWithLogs_FilterForErrors.png](https://ardupilot.org/planner/_images/DiagnosingWithLogs_FilterForErrors.png)](https://ardupilot.org/planner/_images/DiagnosingWithLogs_FilterForErrors.png)

The Subsys (aka Sub-system) gives the area that generated the error and the ECode (aka Error Code) tells you what the error was specifically. The list of subsystems and error codes can be found in the AP\_Logger library [AP\_Logger.h file](https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Logger/AP_Logger.h#L33).

| Subsys | ECode and Description |
| --- | --- |
| 2 = Radio | - 0 = Errors Resolved<br>- 2 = Late Frame : no updates received from receiver for two seconds |
| 3 = Compass | - 0 = Errors Resolved<br>- 1 = Failed to initialise (probably a hardware issue)<br>- 4 = Unhealthy : failed to read from the sensor |
| 5 = Radio Failsafe | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered |
| 6 = Battery Failsafe | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered |
| 8 = GCS Failsafe | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered |
| 9 = Fence Failsafe | - 0 = Failsafe Resolved<br>- 1 = Altitude fence breach, Failsafe Triggered<br>- 2 = Circular fence breach, Failsafe Triggered<br>- 3 = Both Alt and Circular fence breached, Failsafe Triggered<br>- 4 = Polygon fence breached, Failsafe Triggered |
| 10 = Flight mode Change failure | Vehicle was unable to enter the desired flight mode normally because of a bad position estimate<br><br> <br><br>See [flight mode numbers here](https://github.com/ArduPilot/ardupilot/blob/master/ArduCopter/mode.h#L14) for Copter, [Plane modes here](https://github.com/ArduPilot/ardupilot/blob/master/ArduPlane/mode.h#L15), and [Rover modes here](https://github.com/ArduPilot/ardupilot/blob/master/Rover/mode.h#L19) |
| 11 = GPS | - 0 = Glitch cleared<br>- 2 = GPS Glitch occurred |
| 12 = Crash Check | - 1 = Crash into ground detected. Normally vehicle is disarmed soon after<br>- 2 = Loss of control detected. Normally parachute is released soon after |
| 13 = Flip mode | 2 = Flip abandoned (not armed, pilot input or timeout) |
| 15 = Parachute | - 2 = Not Deployed, vehicle too low<br>- 3 = Not Deployed, vehicle landed |
| 16 = EKF Check | - 0 = Variance cleared (position estimate OK)<br>- 2 = Bad Variance (position estimate bad) |
| 17 = EKF Failsafe | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered |
| 18 = Barometer | - 0 = Errors Resolved<br>- 4 = Unhealthy : failed to read from the sensor |
| 19 = CPU Load Watchdog | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered (normally vehicle disarms) |
| 20 = ADSB Failsafe | - 0 = Failsafe Resolved<br>- 1 = No action just report to Pilot<br>- 2 = Vehicle avoids by climbing or descending<br>- 3 = Vehicle avoids by moving horizontally<br>- 4 = Vehicle avoids by moving perpendicular to other vehicle<br>- 5 = RTL invoked |
| 21 = Terrain Data | 2 = missing terrain data |
| 22 = Navigation | - 2 = Failed to set destination<br>- 3 = RTL restarted<br>- 4 = Circle initialisation failed<br>- 5 = Destination outside fence |
| 23 = Terrain Failsafe | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered (normally vehicle RTLs) |
| 24 = EKF Primary changed | - 0 = 1st EKF has become primary<br>- 1 = 2nd EKF has become primary |
| 25 = Thrust Loss Check | - 0 = Thrust Restored<br>- 1 = Thrust Loss Detected (altitude may be prioritised over yaw control) |
| 26 = Sensor Failsafe (Sub) | - 0 = Sensor Failsafe Cleared<br>- 1 = Sensor Failsafe Triggered |
| 27 = Leak Failsafe (Sub) | - 0 = Leak Failsafe Cleared<br>- 1 = Leak Detector Failsafe Triggered |
| 28 = Pilot Input Timeout Failsafe (Sub only) | - 0 = Pilot Input Failsafe Cleared<br>- 1 = Pilot Input Failsafe Triggered |
| 29 = Vibration Failsafe | - 0 = Excessive Vibration Compensation De-activated<br>- 1 = Excessive Vibration Compenstaion Activated |
