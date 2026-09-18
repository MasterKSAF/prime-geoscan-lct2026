---
title: "Downloading and Analyzing Data Logs in Mission Planner — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-downloading-and-analyzing-data-logs-in-mission-planner.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "05486dfcdd494880c64bf4f83f11b7f8e600dcee72c4e953871b4cf91793eab6"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Downloading and Analyzing Data Logs in Mission Planner — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-downloading-and-analyzing-data-logs-in-mission-planner.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="downloading-and-analyzing-data-logs-in-mission-planner"></a>

<a id="common-downloading-and-analyzing-data-logs-in-mission-planner"></a>

# Downloading and Analyzing Data Logs in Mission Planner

Dataflash logs are stored on the autopilot and can be downloaded after a flight. By default, they are created after you first arm the vehicle. This topic explains how to configure and access Dataflash logs.

Depending on the autopilot type and configuration, the dataflash logs may be saved on a SD card, dataflash chip or streamed over MAVLink telemetry ports. The MAVLink option does require a high-speed telemetry port, typically 921600 baud.

Note

In addition to using Mission Planner, many other tools are available to users for log analysis: [MAVExplorer(part of MAVProxy installation)](https://ardupilot.org/dev/docs/using-mavexplorer-for-log-analysis.html#using-mavexplorer-for-log-analysis) and [Web-based tools](https://ardupilot.org/planner/docs/common-webtools.html#common-webtools).

Note

[Telemetry logs](https://ardupilot.org/planner/docs/mission-planner-telemetry-logs.html#mission-planner-telemetry-logs) (also known as “tlogs”) collect similar information to dataflash logs (see [Diagnosing problems using Logs](https://ardupilot.org/planner/docs/common-diagnosing-problems-using-logs.html#common-diagnosing-problems-using-logs) for more information).

Note

If your vehicle is having trouble producing dataflash logs - including the infamous “No IO heartbeat” diagnostic message - try a different SD card. You may also choose to test the card using a dedicated tool, such as `H2testw`. Low board voltages are also known to cause logging issues.

<a id="logging-parameters"></a>

## Logging Parameters

Some commonly used parameters are:

- [LOG\_BACKEND\_TYPE](https://ardupilot.org/sub/docs/parameters.html#log-backend-type): Bitmask for where to save logs to. Common values are “0” to disable logging, “1” (bit 0 set) to log to SD card file, “2”(bit 1 set) to stream over MAVLink and “4”(bit 2 set) to log to board dataflash memory, if equipped.
- [LOG\_BITMASK](https://ardupilot.org/sub/docs/parameters.html#log-bitmask): Bitmask for what items are logged. Normally, use default value, or “0” to disable logging.
- [LOG\_DISARMED](https://ardupilot.org/sub/docs/parameters.html#log-disarmed): Setting to 1 will start logging when power is applied, rather than at the first arming of the vehicle. Useful when debugging pre-arm failures. Setting to 2 will only log on power application other than USB power to prevent logging while setting up on the bench. Setting to 3 will also erase any log in which the vehicle does not proceed to the armed stated. This prevents accumulating numerous logs while configuring on the bench or at the field. See [LOG\_DARM\_RATEMAX](https://ardupilot.org/sub/docs/parameters.html#log-darm-ratemax) also for managing log file sizes while logging disarmed.
- [LOG\_FILE\_DSRMROT](https://ardupilot.org/sub/docs/parameters.html#log-file-dsrmrot): Setting this bit will force the creation of a new log file after disarming, waiting 15 seconds, and then re-arming. Normally, a log will be one file for every power cycle of the autopilot, beginning upon first arm.
- [LOG\_FILE\_MB\_FREE](https://ardupilot.org/sub/docs/parameters.html#log-file-mb-free): This parameter sets the minimum free space on the logging media before logging begins. If this is not available, then older logs will be deleted to provide it during initialization. Default is 500MB.
- [LOG\_FILE\_RATEMAX](https://ardupilot.org/sub/docs/parameters.html#log-file-ratemax): This sets the maximum rate that streaming log messages will be logged to the file backend to limit file sizes. A value of zero(default) means no limit is applied to normal logging, which depends on the [SCHED\_LOOP\_RATE](https://ardupilot.org/sub/docs/parameters.html#sched-loop-rate) value ( 50Hz: Plane, 300Hz: QuadPlane/Rover, 400Hz: Copter, normally). Note that similarly, [LOG\_BLK\_RATEMAX](https://ardupilot.org/sub/docs/parameters.html#log-blk-ratemax) and [LOG\_MAV\_RATEMAX](https://ardupilot.org/sub/docs/parameters.html#log-mav-ratemax) perform the same optional limiting for the BLOCK logging and MAVLink logging streams, respectively.
- [LOG\_MAX\_FILES](https://ardupilot.org/sub/docs/parameters.html#log-max-files): The maximum number of log file that will be written on dataflash or SD card before starting to rotate log number. Limit is a maximum of 500 logs.

Note

If you suspect that you are missing logging entries due to excessive logging speed, you can check the DSF.Dp log message for the amount of missed entries.

Note

Logging of the continuously streaming log messages, such as attitude, sensors, etc. can be paused by using the `RCx_OPTION` auxiliary function “164” on a transmitter channel. Switching this channel high will pause these messages, but not events, mode changes, warnings, etc. This allows autopilots with limited logging capabilities (ie using Block logging to chip memory and no SD card) to log only when desired during the flight, as during tuning phases or determination of TECs parameters, etc. You can also eliminate unneeded log messages using [LOG\_BITMASK](https://ardupilot.org/sub/docs/parameters.html#log-bitmask) to reduce log size

<a id="replay-logging"></a>

## Replay Logging

ArduPilot has the ability to log in a fashion that solutions to EKF/AHRS issues can be more easily verified by actually re-playing a log against code changes to see if the solution results in the desired, corrected behavior. This requires that the logs showing the issue to be worked on be made with logging active during disarmed periods (with [LOG\_DISARMED](https://ardupilot.org/sub/docs/parameters.html#log-disarmed) set to a non-zero value, preferably 3) and [LOG\_REPLAY](https://ardupilot.org/sub/docs/parameters.html#log-replay) =1 , thereby logging more sensor data than normal.

<a id="sd-card-logging-issues"></a>

## SD Card Logging Issues

If you are running into problems with bad logging errors on SD cards, here are some things you can try.

- Format the card to FAT32 or vFAT (newer formats can work with new versions of Ardupilot and better hardware).
- Perform a full format to check for bad sectors.
- Check that the card is not write protected.
- Check card contacts.
- Some cards are problematic, try using a different one.
- Ensure that the card is fast enough to keep up with logging demands (Class 10 works for many, but lower speeds can work too).
- Reduce the amount of data included with the logs in LOG\_BITMASK.
- Incrementally increase BRD\_SD\_SLOWDOWN up to a maximum of 32 (default is 0).

<a id="on-board-dataflash-logging"></a>

## On-Board DataFlash Logging

Some boards do not have SD card interfaces for logging, but rather a limited amount of dataflash, typically 16MB. This saves log files in a manner like a circular buffer. Once the flash is filled, the oldest log file is overwritten with the current logging data. If there is only one file on the flash when space runs out, logging is stopped instead.

A new log file will be started after boot, upon arming, or, immediately if [LOG\_DISARMED](https://ardupilot.org/sub/docs/parameters.html#log-disarmed) is 1.

If [LOG\_FILE\_DSRMROT](https://ardupilot.org/sub/docs/parameters.html#log-file-dsrmrot) is enabled, any disarm will stop logging and a new file started upon the next arm or immediately if [LOG\_DISARMED](https://ardupilot.org/sub/docs/parameters.html#log-disarmed) is 1. Otherwise, logging to the current file will resume on a re-arm. Any reboot stops logging to the current file.

In order to maximize the utility of the limited flash space several things can be done:

- Reduce the things logged using [LOG\_BITMASK](https://ardupilot.org/sub/docs/parameters.html#log-bitmask).
- Eliminate logging the EKF3 messages which are voluminous and usually needed only for problem diagnosis using the [EK3\_LOG\_LEVEL](https://ardupilot.org/sub/docs/parameters.html#ek3-log-level) parameter.
- Only log when needed during the flight, ie tuning, gathering data for TECS tuning, etc. using an RC Aux switch set to “164” to start and stop log writes.
- Reduce the logging rate to a slower rate (below 10Hz) by setting [LOG\_BLK\_RATEMAX](https://ardupilot.org/sub/docs/parameters.html#log-blk-ratemax) which is by default unrestricted.
- Download and erase the logs each flight and only log one file for a flight

Note

some dataflash chips are particularly slow, leading to gaps in the logs. Setting [LOG\_BLK\_RATEMAX](https://ardupilot.org/sub/docs/parameters.html#log-blk-ratemax) to a lower value can help eliminate these gaps.

<a id="downloading-logs-via-mavlink"></a>

<a id="common-downloading-and-analyzing-data-logs-in-mission-planner-downloading-logs-via-mavlink"></a>

## Downloading logs via MAVLink

- Connect your vehicle to the ground station using the micro USB cable
- Open the Mission Planner’s Flight Data screen
- On the bottom left, select the “DataFlash Logs” tab and push the “Download DataFlash Log Via Mavlink” button

 [[../_images/mission_planner_download_logs.png](https://ardupilot.org/planner/_images/mission_planner_download_logs.png)](https://ardupilot.org/planner/_images/mission_planner_download_logs.png)

Then, select the log you want to download. This will save that log to your MissionPlanner/logs directory, in a folder named after the vehicle type, such as QUADCOPTER.

<a id="review-a-log"></a>

## Review a log

For more detailed analysis, click on “Review a Log” and select a log that you’ve already saved to the MissionPlanner/logs directory. Once again, they will be in folders named after the vehicle type, such as QUADCOPTER or ROVER.

<a id="steps-to-review-a-log-downloaded-from-the-internet-or-your-vehicle"></a>

### Steps to review a log downloaded from the internet, or your vehicle

For DataFlash logs, with a .bin or .log extension:

1. Download the log file. Note the place on your computer to which it is downloaded. (For example, it might be C:\\Downloads)
2. Open Mission Planner
3. Navigate to the “Flight Data” page (top left)
4. Select the “Dataflash Logs” tab (mid-screen, left side)
5. Select the “Review a Log” button.
6. A standard Windows “select a file” box will let you go find the .bin file that you downloaded, at the place that you downloaded it. (Per the example above, it is in C:\\Downloads) Choose that file.
7. After reading the log, a Manual Log Review window will be open, which allows you to plot data from the log for inspection. (see below)

<a id="reviewing-the-log-data"></a>

### Reviewing the log data

Once you pick the log you want, you will get charts such as the below. The basic format of the dataflash is:

- Line numbers appear on the very left side of the viewer
- Software version and board type appear at the top
- FMT messages are next which tell the mission planner the column headers for each message type
- PARM rows which show each parameter (in the order in which they appear in the eeprom) along with their value at the beginning of the flight
- Flight data messages including GPS, IMU, etc.

 [[../_images/mp_dataflash_format.png](https://ardupilot.org/planner/_images/mp_dataflash_format.png)](https://ardupilot.org/planner/_images/mp_dataflash_format.png)

Graph any flight data by first clicking on the appropriate row, you should see the column headers update appropriately. Next find the column you wish to graph, click on it and then push the “Graph this data” button. In the example above the ATT’s Roll-In and Roll data have been graphed. The mouse’s scroll wheel can be used to zoom in or out. You may also select an area of the graph to zoom in on it. Zoom out by right-mouse-button clicking and selecting “Set Scale to Default”. [Here’s](https://www.diydrones.com/profiles/blog/show?id=705844%3ABlogPost%3A801607) a mini tutorial on using this feature. You may also filter on just the first column (the flight data message type) by clicking on the first column and selecting the message type from the drop-down. This is very useful especially for viewing the different flight modes (called “MODE” messages) used during the mission. Click the first column again but press “Cancel” to clear the filter.

 [[../_images/MissionPlanner_CLI_openDataflashFilter.png](https://ardupilot.org/planner/_images/MissionPlanner_CLI_openDataflashFilter.png)](https://ardupilot.org/planner/_images/MissionPlanner_CLI_openDataflashFilter.png)

<a id="setting-what-data-you-want-recorded"></a>

## Setting what data you want recorded

The [LOG\_BITMASK](https://ardupilot.org/sub/docs/parameters.html#log-bitmask) parameter controls what messages are recorded in the logs. The bits differ between vehicles. The image above is for Copter.

 [[../_images/mp_dataflash_log_bitmask.png](https://ardupilot.org/planner/_images/mp_dataflash_log_bitmask.png)](https://ardupilot.org/planner/_images/mp_dataflash_log_bitmask.png)

<a id="message-details-copter-specific"></a>

<a id="common-downloading-and-analyzing-data-logs-in-mission-planner-message-details-copter-specific"></a>

## Message Details (Copter specific)

Note

Many messages are detailed in the [Onboard Message Log Messages](https://ardupilot.org/sub/docs/logmessages.html#logmessages) page in each vehicle’s wiki section.

**ATT (attitude information):**

| DesRoll | The pilot’s desired roll angle in degrees (roll left is negative, right is positive) |
| --- | --- |
| Roll | The vehicle’s actual roll in degrees (roll left is negative, right is positive) |
| DesPitch | The pilot’s desired pitch angle in degrees (pitch forward is negative, pitch back is positive) |
| Pitch | The vehicle’s actual pitch angle in degrees (pitch forward is negative, pitch back is positive) |
| DesYaw | The pilot’s desired heading in degrees with 0 = north |
| Yaw | The vehicle’s actual heading in degrees with 0 = north |
| ErrRP | The average size of the roll/pitch error estimate (values between 0 and 1) |
| ErrYaw | The average size of the yaw error estimate (values between 0 and 1) |

**ATUN (auto tune overview):**

|  | Axis: 0 = Roll, 1 = Pitch |
| --- | --- |
| TuneStep | 0 = Returning towards Level (before or after a test), 1 = Testing (i.e. performing a twitch to test response), 2 = Updating gains (twitch completed and gains adjusted) |
| RateMin | Minimum recorded rate during this test |
| RateMax | Maximum recorded rate during this test |
| RPGain | Rate P gain value being tested |
| RDGain | Rate D gain value being tested |
| SPGain | Stabilize P gain being tested |

**ATDE (auto tune step details):**

| Angle | Angle of the copter in centi-degrees for the axis being testedx |
| --- | --- |
| Rate | Rate of rotation of the copter for the axis being tested |

**CAM (time and position when camera shutter was activated):**

| GPSTime | The GPS reported time since epoch in milliseconds |
| --- | --- |
| Lat | The accelerometer + GPS latitude estimate |
| Lng | The accelerometer + GPS longitude estimate |
| Alt | The accelerometer + barometer estimated altitude in cm above ground |
| Roll | The vehicle roll angle in centi-degrees |
| Pitch | The vehicle pitch angle in centi-degrees |
| Yaw | The vehicle’s heading in centi-degrees |

**CMD (commands received from the ground station or executed as part of a mission):**

| CTot | The total number of commands in the mission |
| --- | --- |
| CNum | This command’s number in the mission (0 is always home, 1 is the first command, etc) |
| CId | The [MAVLink message id](https://mavlink.io/en/messages/common.html) |
| Copt | The option parameter (used for many different purposes) |
| Prm1 | The command’s parameter (used for many different purposes) |
| Alt | The command’s altitude in meters |
| Lat | The command’s latitude position |
| Lng | The command’s longitude position |

**COMPASS (raw compass, offset and compassmot compensation values):**

| Field | Description |
| --- | --- |
| MagX, MagY, MagZ | Raw magnetic field values for x, y, and z axis. These are magnetometer readings with calibration applied, not raw magnetometer readings. |
| OfsX, OfsY, OfsZ | Raw magnetic offsets (will only change if COMPASS\_LEARN parameter is 1) |
| MOfsX, MOfsY, MOfsZ | Compassmot compensation for throttle or current |

**CURRENT (battery voltage, current and board voltage information):**

| FIELD | DESCRIPTION |
| --- | --- |
| Thr | Pilot input throttle from 0 ~ 1000 |
| ThrInt | Integrated throttle (i.e. sum of total throttle output for this flight) |
| Volt | Battery voltage in volts \* 100 |
| Curr | Current drawn from the battery in amps \* 100 |
| Vcc | Board voltage |
| CurrTot | Total current drawn from battery |

**CTUN (Control, Throttle and altitude information):**

| FIELD | DESCRIPTION |
| --- | --- |
| TimeUS | Time stamp for messages in microseconds (can be ignored) |
| ThI | The pilot’s throttle in as a number from 0 to 1000 |
| ABst | Angle Boost: throttle increase (from 0 ~ 1000) as a result of the copter leaning over (automatically added to all pilot and autopilot throttle to reduce altitude loss while leaning) |
| ThO | Final throttle output sent to the motors (from 0 ~ 1000). Normally equal to ThrI+ABst while in stabilize mode. |
| ThH | Estimated throttle required to hover throttle in the range 0 ~ 1 |
| DAlt | The Desired Altitude while in AltHold, Loiter, RTL or Auto flight modes. It is influenced by EKF origin, which in 3.5.X is corrected by GPS altitude. This behaviour is turned off in 3.6.X and can be turned on with EKF\_OGN\_HGT\_MASK. |
| Alt | The current EKF Altitude |
| BAlt | Barometer Altitude: The altitude above ground according to the barometer |
| DSAlt | Desired distance in cm from ground or ceiling (only visible if Sonar is available) |
| SAlt | Sonar Altitude: the altitude above ground according to the sonar (Only visible of Sonar is available) |
| TAlt | Terrain altitude (not used by default) |
| DCRt | Desired Climb Rate in cm/s |
| CRt | Climb Rate in cm/s |
| N | Harmonic notch current center frequency for gyro in Hz |

**D32, DU32 (single data values which are either signed 32bit integers or unsigned 32bit integers):**

| FIELD | DESCRIPTION |
| --- | --- |
| id | Identification number for the variable. There are only two possible values:<br><br> <br><br>- 7 = bit mask of internal state (The meaning of individual bits can be found in the def’n of the [ap structure](https://github.com/ardupilot/ardupilot/blob/master/ArduCopter/Copter.h#L296)<br>- 9 = simple mode’s initial heading in centi-degrees |

**EKF (Extended Kalman Filter**):

[Log information here](https://ardupilot.org/dev/docs/extended-kalman-filter.html#extended-kalman-filter-interpreting-log-data) (Dev Wiki). Overview [here](https://ardupilot.org/sub/docs/common-apm-navigation-extended-kalman-filter-overview.html#common-apm-navigation-extended-kalman-filter-overview).

**ERR (an error message):**

SubSystem and Error codes listed below

| Subsys | ECode and Description |
| --- | --- |
| 2 = Radio | - 0 = Errors Resolved<br>- 2 = Late Frame : no updates received from receiver for two seconds |
| 3 = Compass | - 0 = Errors Resolved<br>- 1 = Failed to initialise (probably a hardware issue)<br>- 4 = Unhealthy : failed to read from the sensor |
| 5 = Radio Failsafe | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered |
| 6 = Battery Failsafe | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered |
| 8 = GCS Failsafe | - 0 = Failsafe Resolved<br>- 1 = Failsafe Triggered |
| 9 = Fence Failsafe | - 0 = Failsafe Resolved<br>- 1 = Altitude fence breach, Failsafe Triggered<br>- 2 = Circular fence breach, Failsafe Triggered<br>- 3 = Both Alt and Circular fence breached, Failsafe Triggered<br>- 4 = Polygon fence breached, Failsafe Triggered |
| 10 = Flight mode Change failure | Vehicle was unable to enter the desired flight mode normally because of a bad position estimate<br><br> <br><br>See [flight mode numbers here](https://github.com/ArduPilot/ardupilot/blob/master/ArduCopter/mode.h#L77) |
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

**EV: (an event number)**. The full list of possible events can be found in [AP\_Logger.h](https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Logger/AP_Logger.h#L94) but the most common are:

| Event No | DESCRIPTION |
| --- | --- |
| 10 | Armed |
| 11 | Disarmed |
| 15 | Auto Armed (pilot has raised throttle above zero and autopilot is free to take control of throttle) |
| 18 | Land Complete |
| 25 | Set Home (home location coordinates have been capture) |
| 28 | Not Landed (aka Takeoff complete) |

**GPA: (Global Position Accuracy)**

| FIELD | DESCRIPTION |
| --- | --- |
| VDop | Vertical dilution of precision, a unitless measure of precision [https://en.wikipedia.org/wiki/Dilution\_of\_precision](https://en.wikipedia.org/wiki/Dilution_of_precision) |
| HAcc | Horizontal Accuracy as reported by the GPS module, in meters |
| VAcc | Vertical Accuracy as reported by the GPS module, in meters |
| SAcc | Speed accuracy as reported by the GPS, in m/s/s |
| VV | **Flag to indicate if the GPS is reporting vertical velocity**<br><br><br><br>0 No vertical velocity data 1 GPS has vertical velocity data |
| SMS | The autopilot time in milliseconds that the accuracy/GPS position data is associated with. |
| Delta | The time between when the previous GPS message and the current GPS message was parsed by the autopilot, in milliseconds |

**GPS:**

| FIELD | DESCRIPTION |
| --- | --- |
| Status | 0 = no GPS, 1 = GPS but no fix, 2 = GPS with 2D fix, 3 = GPS with 3D fix |
| Time | The GPS reported time since epoch in milliseconds |
| NSats | The number of satellites current being used |
| HDop | A measure of gps precision (1.5 is good, \>2.0 is not so good) [https://en.wikipedia.org/wiki/Dilution\_of\_precision](https://en.wikipedia.org/wiki/Dilution_of_precision) |
| Lat | Latitude according to the GPS |
| Lng | Longitude according to the GPS |
| RelAlt | Accelerometer + Baro altitude in meters |
| Alt | GPS reported altitude (not used by the autopilot) |
| SPD | Horizontal ground speed in m/s |
| GCrs | Ground course in degrees (0 = north) |

**IMU (accelerometer and gyro information):**

| FIELD | DESCRIPTION |
| --- | --- |
| GyrX, GyrY, GyrZ | The raw gyro rotation rates in radians/second |
| AccX, AccY, AccZ | The raw accelerometer values in m/s/s |

**Mode (flight mode):**

| FIELD | DESCRIPTION |
| --- | --- |
| Mode | The flight mode displayed as a string (i.e. STABILIZE, LOITER, etc) |
| ThrCrs | Throttle cruise (from 0 ~ 1000) which is the autopilot’s best guess as to what throttle is required to maintain a stable hover |
| Rsn | Reason for mode change (TX command, failsafe, etc) . The meaning of code values can be found in [ModeReason](https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Vehicle/ModeReason.h) |

**NTUN (navigation information):**

| FIELD | DESCRIPTION |
| --- | --- |
| WPDst | Distance to the next waypoint (or loiter target) in cm. Only updated while in Loiter, RTL, Auto. |
| WPBrg | Bearing to the next waypoint in degrees |
| PErX | Distance to intermediate target between copter and the next waypoint in the latitude direction |
| PErY | Distance to intermediate target between copter and the next waypoint in the longitude direction |
| DVelX | Desired velocity in cm/s in the latitude direction |
| DVelY | Desired velocity in cm/s in the longitude direction |
| VelX | Actual accelerometer + gps velocity estimate in the latitude direction |
| VelY | Actual accelerometer + gps velocity estimate in the longitude direction |
| DAcX | Desired acceleration in cm/s/s in the latitude direction |
| DAcY | Desired acceleration in cm/s/s in the longitude direction |
| DRol | Desired roll angle in centi-degrees |
| DPit | Desired pitch angle in centi-degrees |

**PM (performance monitoring):**

| FIELD | DESCRIPTION |
| --- | --- |
| NLon | Number of long running main loops (i.e. loops that take more than 20% longer than they should according to [SCHED\_LOOP\_RATE](https://ardupilot.org/sub/docs/parameters.html#sched-loop-rate) - ex. 3ms for 400Hz rate) |
| NLoop | The total number of loops since the last PM message was displayed. This allows you to calculate the percentage of slow running loops (which should never be higher than 15%). Note that the value will depend on the autopilot clock speed |
| MaxT | The maximum time that any loop took since the last PM message. This shouldn’t exceed 120% of scheduler loop period, but will be much higher during the interval where the motors are armed |
| Mem | Available memory, in bytes |
| Load | Percentage (times 10) of the scheduler loop period when CPU is used |

**RCOUT (pwm output to individual RC outputs):**

RC1, RC2, etc : pwm command sent from autopilot to the esc/motor/RC output

<a id="viewing-kmz-files"></a>

## Viewing KMZ FILES

When you download the dataflash log files from the autopilot it will automatically create a KMZ file (file with extension .kmz). This file can be opened with Google Earth (just double click the file) to view your flight in Google Earth. Please see the instructions on the [Telemetry Logs Page](https://ardupilot.org/planner/docs/mission-planner-telemetry-logs.html#mission-planner-telemetry-logs-creating-3d-images-of-the-flight-path) for additional details.

<a id="video-tutorials"></a>

## Video tutorials
