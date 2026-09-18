---
title: "Measuring Vibration — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-measuring-vibration.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "ef9a60e320811dac889616101c30339234d852d1e7ed9d890386301173023d6a"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Measuring Vibration — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-measuring-vibration.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="measuring-vibration"></a>

<a id="common-measuring-vibration"></a>

# Measuring Vibration

Autopilots have accelerometers that are sensitive to vibrations. These accelerometer values are combined with barometer and GPS data to estimate the vehicle’s position. With excessive vibrations, the estimate can be thrown off and lead to very bad performance in modes that rely on accurate positioning (e.g. on Copter: AltHold, Loiter, RTL, Guided, Position and Auto flight modes).

These instructions explain how to measure the vibration levels. If you find they are out-of-tolerance then follow the advice found on the [Vibration Damping](https://ardupilot.org/sub/docs/common-vibration-damping.html#common-vibration-damping) page.

<a id="real-time-view-in-ground-station"></a>

## Real-Time view in Ground Station

Ground Stations can display a real-time view of vibration and clipping. If using the Mission Planner click on “Vibe” on the HUD to display the current vibration levels.

> [[../_images/vibration-realtime-mp.png](https://ardupilot.org/planner/_images/vibration-realtime-mp.png)](https://ardupilot.org/planner/_images/vibration-realtime-mp.png)

Vibration levels below 30m/s/s are normally acceptable. Levels above 30m/s/s *may* have problems and levels above 60m/s/s nearly always have problems with position or altitude hold.

<a id="vibe-dataflash-log-message"></a>

## Vibe Dataflash Log message

Check the recorded Vibe levels are mostly below 30m/s/s

- Perform a regular flight (i.e. not just a gentle hover) of at least a few minutes and [download the dataflash logs](https://ardupilot.org/planner/docs/common-downloading-and-analyzing-data-logs-in-mission-planner.html#common-downloading-and-analyzing-data-logs-in-mission-planner-downloading-logs-via-mavlink).
- Using the Mission Planner or other ground station graph the VIBE message’s VibeX, VibeY and VibeZ values. These show the standard deviation of the primary accelerometer’s output in m/s/s. The image below, taken from a 3DR IRIS, shows normal levels which are below 15m/s/s but occasionally peak to 30m/s/s. Maximum acceptable values appear to be below 30m/s/s (see second picture below).
- Graph the Clip0, Clip1 and Clip2 values which increase each time one of the accelerometers reaches its maximum limit (16G). Ideally these should be zero for the whole flight but low numbers (\<100) are likely ok especially if they occur during hard landings. A regularly increasing number through the log indicates a serious vibration problem that [should be fixed](https://ardupilot.org/sub/docs/common-vibration-damping.html#common-vibration-damping).

   [[../_images/mp_vibe_dataflash_msg.png](https://ardupilot.org/planner/_images/mp_vibe_dataflash_msg.png)](https://ardupilot.org/planner/_images/mp_vibe_dataflash_msg.png)

This is an example of a vehicle that had position estimate problems due to high vibrations.

 [[../_images/mp_measuring_vibration_bad_vibes.png](https://ardupilot.org/planner/_images/mp_measuring_vibration_bad_vibes.png)](https://ardupilot.org/planner/_images/mp_measuring_vibration_bad_vibes.png)

The algorithm for calculating the vibration levels can be seen in the [AP\_InertialSensor.cpp’s calc\_vibration\_and\_clipping()](https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_InertialSensor/AP_InertialSensor.cpp#L1609) method but in short it involves calculating the standard deviation of the accelerometer readings like this:

- Capture the raw x, y and z accelerometer values from the primary IMU
- High-pass filter the raw values at 5hz to remove the vehicle’s movement and create a “accel\_vibe\_floor” for x,y and z axis.
- Calculate the difference between the latest accel values and the accel\_vibe\_floor.
- Square the above differences, filter at 2hz and then calculate the square root (for x, y and z). These final three values are what appear in the VIBE msg’s VibeX, Y and Z fields.

When looking at vibrations in a log the first thing to look at is the clipping. If the clipping is 0 that’s good. That means the vibrations that are being detected aren’t overwhelming the IMU.

When troubleshooting the vibration, consider the axis of the vibration as a staring point to find the problem:

> If X AND Y are both high, then you may have an issue with a motor bearing or prop balance. Or you may need more/better overall vibration damping for your FC. If X OR Y is high then you may have an issue with your FC mounting. Maybe a wire is bouncing on the FC or restraining it. Or maybe your vibration damping works better in one axis than the other. If you have a Z vibration then you may have a track issue with propeller (bent blade) or vertical play in a motor.

Also consider that some flight conditions/airframes will have different natural vibrations. If the vibrations look good in a hover, but they increase with speed, perhaps there is an aerodynamic issue with the airframe, or in wind,

<a id="looking-for-the-leans"></a>

## Looking for “The Leans”

**The Leans** occurs when the vehicle’s attitude estimate becomes incorrect causing it to lean significantly even though the pilot is commanding level flight. The cause of the problem is often accelerometer aliasing which can be confirmed by comparing the Roll and Pitch attitude estimates from each of the estimation systems (i.e. each AHRSs or EKFs). The attitude estimates should be within a few degrees of each other

- Download the dataflash log and open in the ground station’s log viewer
- Compare the AHRS2.Roll, NKF1\[0\].Roll and NKF1\[1\].Roll if using EKF2, or AHRS2.Roll, XKF1\[0\].Roll and XKF1\[1\].Roll, if using EKF3

The image below shows a typical log in which the attitudes match well

 [[../_images/vibration-measuring-leans.png](https://ardupilot.org/planner/_images/vibration-measuring-leans.png)](https://ardupilot.org/planner/_images/vibration-measuring-leans.png)

<a id="advanced-analysis-with-fft"></a>

## Advanced Analysis with FFT

Refer to the [Measuring Vibration with “Raw IMU Logging”](https://ardupilot.org/planner/docs/common-raw-imu-logging.html#common-raw-imu-logging) page for instructions on how to collect large amounts of IMU data and perform an FFT analysis to determine the frequencies with the most vibration.

<a id="imu-dataflash-log-message"></a>

## IMU Dataflash Log message

For very old versions of ArduPilot that do not include the Vibe message the IMU values can be checked directly

- Ensure the [LOG\_BITMASK](https://ardupilot.org/sub/docs/parameters.html#log-bitmask) parameter is set to include IMU data so accelerometer values are recorded to the dataflash logs
- Fly your copter in Stabilize mode and try to maintain a level hover (it doesn’t need to be perfectly stable or level)
- [Download the dataflash logs and](https://ardupilot.org/planner/docs/common-downloading-and-analyzing-data-logs-in-mission-planner.html#common-downloading-and-analyzing-data-logs-in-mission-planner-downloading-logs-via-mavlink) after the download has completed, use the Mission Planner’s “Review a Log” button to open the latest file in the log directory (it’s last digit will be the Log number you downloaded so in the example above we downloaded Log #1 so the filename will end in 1.log)
- When the Log Browser appears, scroll down until you find any IMU message. Click on the row’s AccX and push **Graph this data** Left button. Repeat for the AccY and AccZ columns to produce a graph like below.

  [[DiagnosingWithLogs_Vibes](https://ardupilot.org/planner/_images/DiagnosingWithLogs_Vibes.png)](https://ardupilot.org/planner/_images/DiagnosingWithLogs_Vibes.png)
- Check the scale on the left and ensure that your vibration levels for the AccX and AccY are between -3 and +3. For AccZ the acceptable range is -15 to -5. If it is very close or over these limits you should refer back to the [Vibration Damping](https://ardupilot.org/sub/docs/common-vibration-damping.html#common-vibration-damping) page for possible solutions.
- After all the above is complete, go to the Mission Planner’s standard parameters page (you may need to press the **Connect** button again) and set the Log Bitmask back to “Default”. This is important because especially on the APM logging requires significant CPU resources and it’s a waste to log these if they’re not really needed.
