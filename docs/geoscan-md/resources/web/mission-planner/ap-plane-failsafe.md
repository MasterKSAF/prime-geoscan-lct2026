---
title: "Plane Failsafe Function — Plane  documentation"
source_url: "https://ardupilot.org/plane/docs/apms-failsafe-function.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "57a62cc59d135953947f05ad895be498cc731a23b675a54846ccb50a3b706a8f"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Plane Failsafe Function — Plane  documentation](https://ardupilot.org/plane/docs/apms-failsafe-function.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="plane-failsafe-function"></a>

<a id="apms-failsafe-function"></a>

# Plane Failsafe Function

Plane has a limited failsafe function which is designed to do four things:

1. Detects a RC Failsafe condition and then initiating a defined response, such as returning to home. Detection of an RC Failsafe is either a complete loss, or corruption, of RC signals, or the receiver sets a FS bit in its data stream for those protocols supporting it (SBUS, etc.), or that the throttle channel PWM value falls below a certain point set by [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value). This RC failsafe must be enabled by setting [THR\_FAILSAFE](https://ardupilot.org/plane/docs/parameters.html#thr-failsafe) = 1.
2. Optionally, detect loss of telemetry (GCS Failsafe) and take an programmable action, such as switching to return to launch (RTL) mode.

Either of the above have two phases: Short Failsafe which occurs a programmable time after loss of RC or telemetry, which allows optionally circling to try to recover the signals, and if the loss persists longer, a Long Failsafe which determines what long term action is to be taken.

3. Detect loss of GPS for more than 20 seconds and switch into Dead Reckoning mode until GPS signal is regained. See [https://youtu.be/0VMx2u8MlUU](https://youtu.be/0VMx2u8MlUU) for a demo.
4. Optionally, detect low battery conditions (low voltage/remaining capacity) and initiate a programmable response, such as returning to home. ArduPilot supports this on multiple batteries.

Here’s what the failsafe **will not do**:

- Detect if one or more individual RC channel has failed or become disconnected
- Detect if you’re flying too far away or are about to hit the ground
- Detect autopilot hardware failures, such as low-power brownouts or in-air reboots
- Detect if the Plane software is not operating correctly
- Detect other problems with the aircraft, such as motor failures
- Otherwise stop you from making setup or flight mistakes

Note

See [Advanced Failsafe Configuration](https://ardupilot.org/plane/docs/advanced-failsafe-configuration.html#advanced-failsafe-configuration) for extended failsafe configurations.

<a id="rc-failsafe"></a>

## RC Failsafe

<a id="radio-signal-failure"></a>

<a id="apms-failsafe-function-throttle-failsafe"></a>

### Radio Signal Failure

If the received signal is lost or the control information corrupted for greater than [RC\_FS\_TIMEOUT](https://ardupilot.org/plane/docs/parameters.html#rc-fs-timeout) (default = 1 sec), or the receiver sets its “failsafe bit” in protocols which have this (like Sbus, FPort, etc.), or RC\_OVERRIDES are lost if [using a GCS only](https://ardupilot.org/plane/docs/common-gcs-only-operation.html#common-gcs-only-operation) is being used, then an RC Failsafe condition occurs and the actions described in the [RC Failsafe Actions](https://ardupilot.org/plane/docs/apms-failsafe-function.html#fs-actions) section below will be taken, if the [THR\_FAILSAFE](https://ardupilot.org/plane/docs/parameters.html#thr-failsafe) parameter is 1.

Note

by setting [RC\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#rc-options) bit 2, you can force ArduPilot to ignore the “failsafe” bits in the protocol, and only initiate RC Failsafe due to missing or corrupted control information.

<a id="throttle-failsafe"></a>

### Throttle Failsafe

In addition, if the throttle signal falls below a threshold set by [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value) and the [THR\_FAILSAFE](https://ardupilot.org/plane/docs/parameters.html#thr-failsafe) is = 1, an RC Failsafe condition will be entered, a Ground Control Station text message (“Throttle Failsafe On”) will be sent (to differentiate from a Radio Signal Failure Failsafe), and the actions described in the RC Failsafe Actions section below will be taken.

<a id="throttle-failsafe-setup"></a>

### Throttle Failsafe Setup

Note

Throttle Failsafe is not required. If you wish to have failsafe protection against RC signal loss, but not setup a throttle signal controlled failsafe, then set [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value) lower than the lowest RC throttle signal that can be sent to the autopilot from the receiver.

In order to activate the Throttle Failsafe, the throttle signal received by the autopilot must be below [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value). Once setup, this can be controlled by the pilot to initiate Throttle failsafe intentionally (for testing, or instead of setting up an RTL position on the flight mode switch), or by having the receiver, itself, send that value when it loses RC signal.

Note

having the receiver send a pre-set failsafe throttle value upon signal loss is NOT recommended and can lead to issues if a battery level failsafe is setup in QuadPlanes. Setting the receiver to send “no pulses” is much preferred. However, some very old receivers will only send a low throttle level in failsafe, see the section below, [Old Receivers](https://ardupilot.org/plane/docs/apms-failsafe-function.html#old-rx).

The system must be setup such that the throttle channel’s signal can go below [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value) (Default is 950), but still be above it for normal low throttle stick operation. Before doing the [RC Calibration](https://ardupilot.org/plane/docs/common-radio-control-calibration.html#common-radio-control-calibration) setup step which determines normal operating ranges for the throttle channel and others, make sure that the low throttle stick position on your transmitter is above [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value). This can be done several ways:

- When you do the [RC Calibration](https://ardupilot.org/plane/docs/common-radio-control-calibration.html#common-radio-control-calibration) setup step, change the trim tab for the throttle channel to adjust its signal 40-50us above [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value) at low throttle stick. This will be the normal operating position. Lowering the trim tab and setting the [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value) to that value allows initiating a failsafe at low trim.
- Setup a transmitter switch that you will use to force failsafe such that it forces the throttle channel signal, using a mix, to below [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value) when activated, allowing normal operation otherwise.

<a id="rc-failsafe-operation"></a>

<a id="fs-actions"></a>

### RC Failsafe Operation

- When RC Failsafe is entered, all RC inputs (except throttle in the case of Throttle Failsafe), are ignored as the autopilot takes its failsafe actions.
- First, the autopilot will go into Short Failsafe when it detects RC Failsafe for more than 0.5 seconds.
- A message will be displayed on your Ground Control Station(GCS), or OSD, if its message panel is enabled, that a Short Failsafe is active, and the autopilot will take the [FS\_SHORT\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-short-actn), if enabled. The default is CIRCLE mode. This is intended to possibly allow the vehicle’s changing orientation to re-acquire the signal, but other actions can be assigned. See [FS\_SHORT\_ACTN parameter below](https://ardupilot.org/plane/docs/apms-failsafe-function.html#failsafe-parameters) for how each mode responds to the selected action value.
- If the condition causing the Short Failsafe is removed, the vehicle will return to the previous mode, and a message will be displayed that Short Failsafe is cleared. If it was a Throttle Failsafe that caused the RC Failsafe, and throttle was increased in order to exit, then an additional message will be sent stating that the Throttle Failsafe is OFF.
- If the condition causing the Short Failsafe persists longer than [FS\_LONG\_TIMEOUT](https://ardupilot.org/plane/docs/parameters.html#fs-long-timeout) seconds the autopilot will go into Long Failsafe, send a message to the GCS that it has been entered, and execute the [FS\_LONG\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-long-actn) action, if enabled. The default setting for Long Failsafe action to take is RTL (Return to Launch). See [FS\_LONG\_ACTN parameter below](https://ardupilot.org/plane/docs/apms-failsafe-function.html#failsafe-parameters) for how each mode responds to the selected action value.
- If the RC Failsafe condition is later exited, a message will be displayed that the Long Failsafe is cleared, but the flight mode will not revert. If it was a Throttle Failsafe that caused the RC Failsafe, and throttle was increased in order to exit, then an additional message will be sent stating that the Throttle Failsafe is OFF.

Note

The action set by [FS\_LONG\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-long-actn) will continue even if your RC signal is reacquired, if the flight mode is the same as it was before the failsafe action began. Once RC signal is reacquired, the [FS\_LONG\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-long-actn) can be exited via a mode change on the [FLTMODE\_CH](https://ardupilot.org/plane/docs/parameters.html#fltmode-ch). If the mode on the RC transmitter was changed during the failsafe period, then this changed mode is entered after the RC signal is restored. In addition, other failsafes, such as battery failsafe, can also change the mode, if they occur subsequently to the RC signal loss.

<a id="bench-testing-rc-failsafe"></a>

### Bench Testing RC Failsafe

1. Power up the system and verify that you are seeing RC control in the Mission Planner SETUP-\>Mandatory Hardware-\>Radio Calibration tab and in a non-auto mode (Manual, Stabilize, FBW are ok). Check that normal throttle movements to idle do NOT trigger a failsafe and normal control stick movements are observed
2. Switch to Mission Planners DATA View tab. Turn off the transmitter. You should see the flight mode switch to [FS\_SHORT\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-short-actn). After [FS\_LONG\_TIMEOUT](https://ardupilot.org/plane/docs/parameters.html#fs-long-timeout) sec, if enabled, the flight mode should then switch to [FS\_LONG\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-long-actn). Turn the transmitter back on and change flight modes. The Long Failsafe flight mode should change to the selected mode.
3. If Throttle Failsafe is setup (ie via trim tab or transmitter switch). Check that it operates correctly by activating it and watching for Short and Long Failsafes to occur.

If you observe this behavior, your RC Failsafe function has been set up correctly. If not, recheck that the parameters above have been set correctly.

<a id="older-receivers"></a>

<a id="old-rx"></a>

### Older Receivers

Some very old RC receivers cannot be set to send “no pulses” when losing RC signal and simple hold the ROLL/PITCH/YAW RC channels at their last value and set the throttle channel to its minimum PWM value (low throttle). For those, the only way to setup an RC failsafe is to set the [THR\_FS\_VALUE](https://ardupilot.org/plane/docs/parameters.html#thr-fs-value) to slightly above that value and use the transmitters trim tab to raise the idle stick value 40-50us above that for normal operation.

Note

be sure to do [ESC calibration](https://ardupilot.org/plane/docs/common-esc-calibration.html#common-esc-calibration) after you have setup the failsafes and throttle ranges.

**Transmitter Tutorials:**

[Spektrum Setup](https://diydrones.com/profiles/blogs/spektrum-dx8-and-ar8000-failsafe-setup)

<a id="gcs-failsafe"></a>

## GCS Failsafe

**How it works.** When flying while using telemetry on the GCS, the autopilot can be programmed to trigger into failsafe mode if it loses telemetry from its primary GCS (set by [MAV\_GCS\_SYSID](https://ardupilot.org/plane/docs/parameters.html#mav-gcs-sysid)). In the event that the autopilot stops receiving MAVlink (telemetry protocol) heartbeat messages from it, [FS\_LONG\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-long-actn) applies just as in the case of a long Throttle Failsafe. See [FS\_LONG\_ACTN parameter below](https://ardupilot.org/plane/docs/apms-failsafe-function.html#failsafe-parameters) for how each mode responds to the selected action value.

**Setup.**

1. Set [FS\_GCS\_ENABL](https://ardupilot.org/plane/docs/parameters.html#fs-gcs-enabl) to 1 to enable it.
2. Connect to the Mission Planner via telemetry. Verify on the bottom right corner of the HUD that you are armed and “flying” in a non auto mode (Manual, Stabilize, FBW are ok). Be sure you have the GCS connected or failsafe will occur immediately, possibly starting the motors!
3. Unplug the telemetry radio getting telemetry from the primary GCS. After a few minutes power off your autopilot. (Remember the autopilot will not go fully into failsafe until [FS\_LONG\_TIMEOUT](https://ardupilot.org/plane/docs/parameters.html#fs-long-timeout) seconds of MAVLink inactivity have passed).
4. Connect your autopilot to the mission planner and pull the logs. Verify on the log that the autopilot went into RTL after [FS\_LONG\_TIMEOUT](https://ardupilot.org/plane/docs/parameters.html#fs-long-timeout) sec of MAVLink inactivity.

<a id="configuring-for-ground-control-station-control-beyond-rc-range"></a>

### Configuring for Ground Control Station Control beyond RC range

If the telemetry range exceeds the RC transmitter range, then it may be desired to prevent loss of RC signal from initiating a failsafe. Reliance on the above GCS failsafe would be then be used to provide failsafe protection. In order to prevent the RC system from interfering with GCS operation, set [THR\_FAILSAFE](https://ardupilot.org/plane/docs/parameters.html#thr-failsafe) = 2. This prevents the RC failsafe action from being taken, but still detects the failsafe condition and ignores the RC inputs, preventing possible interference to Ground Control Station control of the vehicle. Control via the RC system can be resumed once back into its range.

<a id="configuring-for-valid-rc-outputs-while-in-rc-failsafe"></a>

## Configuring for valid RC outputs while in RC Failsafe

Normally, the RC channels are ignored when in RC Failsafe (except the throttle channel, but for failsafe detection exit only). Sometimes it is desirable to allow the preset signal loss values( for receivers capable of this ), to be used in the event of an RC failsafe. For example, parachute activation, or other controls via RC passthrough (see [Auxiliary Functions](https://ardupilot.org/plane/docs/common-auxiliary-functions.html#common-auxiliary-functions)) could be desired when in RC failsafe. For receivers with this capability and which use a FS data bit, setting [RC\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#rc-options) bit 2 to “1”, can accomplish this. In this case, the FS bit is ignored. Upon RC signal loss the receiver would go to its pre-set channel outputs values, but a failsafe action would not be taken by ArduPilot, since the receiver is still outputting valid data as far as ArduPilot can detect. The fixed RC channel values would processed as normal by ArduPilot.

Note

In this setup, it is usually necessary to make sure that the flight mode channel will force an RTL or AUTO mission to return the vehicle when the receiver loses RC signal, since no failsafe action will be taken, otherwise. The values of the flight control channels for Roll, Pitch, Yaw and Throttle need to be appropriately set also (usually neutral positions).

Warning

Since the autopilot cannot know if the RC link is lost in this configuration, it is possible to get into dangerous situations, especially with QuadPlanes. For example, you are low on battery and far away, and the battery failsafe is active and attempting a VTOL land to prevent a crash. As it drops out of RC range, it will switch to the RC failsafe mode set in the receiver, and attempt to execute that, canceling the battery failsafe action, and ultimately resulting in a crash.

<a id="battery-failsafe"></a>

<a id="plane-battery-failsafe"></a>

## Battery Failsafe

Note

This failsafe requires the vehicle have a working [Power Module](https://ardupilot.org/plane/docs/common-powermodule-landingpage.html#common-powermodule-landingpage).

Note

ArduPilot supports up to 10 batteries/power monitors. All the discussion below applies to those optional batteries also. Each can trigger a failsafe and each can have different actions and setup values. In addition, a group of batteries can be treated as a single unit, see `BATTx_MONITOR` = 10.

Note

the battery low failsafe voltage must be higher than the battery critical failsafe voltage or a pre-arm error will occur.

<a id="when-the-failsafe-will-trigger"></a>

### When the failsafe will trigger

If enabled and set-up correctly the battery failsafe will trigger if the main battery’s

- voltage drops below the voltage held in the [BATT\_LOW\_VOLT](https://ardupilot.org/plane/docs/parameters.html#batt-low-volt) parameter (or FS\_BATT\_VOLTAGE in older versions) for more than 10 seconds. If set to zero (the Plane default value) the voltage based trigger will be disabled.
- remaining capacity falls below the [BATT\_LOW\_MAH](https://ardupilot.org/plane/docs/parameters.html#batt-low-mah) parameter (or FS\_BATT\_MAH in older versions) 20% of the battery’s full capacity is a good choice (i.e. “1000” for a 5000mAh battery). If set to zero the capacity based trigger will be disabled (i.e. only voltage will be used)

<a id="what-will-happen"></a>

### What will happen

When the failsafe is triggered:

- Buzzer will play a loud low-battery alarm
- LEDs will flash yellow
- A warning message will be displayed on the ground station’s HUD (if telemetry is connected)
- [BATT\_FS\_LOW\_ACT](https://ardupilot.org/plane/docs/parameters.html#batt-fs-low-act) will be executed

<a id="two-stage-battery-failsafe"></a>

### Two-Stage Battery Failsafe

Plane includes a two-layer battery failsafe. This allows setting up a follow-up action if the battery voltage or remaining capacity falls below an even lower threshold.

- [BATT\_CRT\_VOLT](https://ardupilot.org/plane/docs/parameters.html#batt-crt-volt) - holds the secondary (lower) voltage threshold. Set to zero to disable. Default is zero.
- [BATT\_CRT\_MAH](https://ardupilot.org/plane/docs/parameters.html#batt-crt-mah) - holds the secondary (lower) capacity threshold. Set to zero to disable. Default is zero.
- [BATT\_FS\_CRT\_ACT](https://ardupilot.org/plane/docs/parameters.html#batt-fs-crt-act) - holds the secondary action to take. A reasonable setup would be to have [BATT\_FS\_LOW\_ACT](https://ardupilot.org/plane/docs/parameters.html#batt-fs-low-act) = 1 (RTL) and [BATT\_FS\_CRT\_ACT](https://ardupilot.org/plane/docs/parameters.html#batt-fs-crt-act) = 2 (Land)

<a id="advanced-battery-failsafe-settings"></a>

### Advanced Battery Failsafe Settings

- [BATT\_FS\_VOLTSRC](https://ardupilot.org/plane/docs/parameters.html#batt-fs-voltsrc) allows configuring whether the raw battery voltage or a sag corrected voltage is used
- [BATT\_LOW\_TIMER](https://ardupilot.org/plane/docs/parameters.html#batt-low-timer) can configure how long the voltage must be below the threshold for the failsafe to trigger
- `BATTx_` parameters can be setup to trigger the failsafe on other batteries

<a id="battery-failsafe-actions"></a>

### Battery Failsafe Actions

The following is a description of the actions that can be taken for battery failsafes:

<table class="docutils align-default">
<thead>
<tr class="row-odd"><th class="head" rowspan="2"><p>Value</p></th>
<th class="head" rowspan="2"><p>Action</p></th>
<th class="head" rowspan="2"><p>Description</p></th>
</tr>
<tr class="row-even"></tr>
</thead>
<tbody>
<tr class="row-odd"><td rowspan="2"><p>0</p></td>
<td rowspan="2"><p>Warn Only</p></td>
<td rowspan="2"><p>Do nothing except warn</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"><td rowspan="2"><p>1</p></td>
<td rowspan="2"><p>RTL</p></td>
<td rowspan="2"><p>Switch to <a class="reference internal" href="https://ardupilot.org/plane/docs/rtl-mode.html#rtl-mode"><span class="std std-ref">RTL</span></a> mode</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"><td rowspan="2"><p>2</p></td>
<td rowspan="2"><p>Land</p></td>
<td rowspan="2"><p>Switch to AUTO mode and execute nearest DO_LAND sequence, if in mission</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"><td rowspan="2"><p>3</p></td>
<td rowspan="2"><p>Terminate</p></td>
<td rowspan="2"><p>Disarm</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"><td rowspan="2"><p>4</p></td>
<td rowspan="2"><p>QLAND</p></td>
<td rowspan="2"><p>If QuadPlane, switch to <a class="reference internal" href="https://ardupilot.org/plane/docs/qland-mode.html#qland-mode"><span class="std std-ref">QLAND Mode</span></a>, otherwise do nothing</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"><td rowspan="2"><p>5</p></td>
<td rowspan="2"><p>Parachute</p></td>
<td rowspan="2"><p>Trigger Parachute (Critical action only)</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"><td rowspan="3"><p>6</p></td>
<td rowspan="3"><p>LOITER_TO_QLAND</p></td>
<td rowspan="3"><p>If QuadPlane, switch to LOITER_TO_QLAND mode,
otherwise do nothing</p></td>
</tr>
<tr class="row-even"></tr>
<tr class="row-odd"></tr>
<tr class="row-even"><td rowspan="3"><p>7</p></td>
<td rowspan="3"><p>AUTOLAND or RTL</p></td>
<td rowspan="3"><p>If Fixed Wing, switch to AUTOLAND if available (see <a class="reference internal" href="https://ardupilot.org/plane/docs/mode_autoland.html#mode-autoland"><span class="std std-ref">AUTOLAND Mode</span></a>. If
unavailable or QuadPlane switch to RTL</p></td>
</tr>
<tr class="row-odd"></tr>
<tr class="row-even"></tr>
</tbody>
</table>

<a id="failsafe-parameters-and-their-meanings"></a>

<a id="failsafe-parameters"></a>

## Failsafe Parameters and their Meanings

<a id="short-failsafe-action-fs-short-actn"></a>

### Short failsafe action ([FS\_SHORT\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-short-actn) )

The action to immediately take on a RC failsafe event .

No Action is ever taken for Short FailSafe in these modes:

- CIRCLE
- RTL
- TAKEOFF
- QRTL
- QLAND
- LOITER to Alt and QLAND

[FS\_SHORT\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-short-actn) = 3 disables taking action in ANY mode

Note

if in AutoLanding in AUTO or AUTOLAND, it will always continue to the landing

In QuadPlanes, Short FailSafe will force QLAND by default, RTL if bit 20 of [Q\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#q-options) is set, or QRTL if bit 5 of [Q\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#q-options) is set, if entered from these modes:

- QSTABILIZE
- QHOVER
- QLOITER
- QACRO
- QAUTOTUNE

Otherwise:

<table class="docutils align-default">
<thead>
<tr class="row-odd"><th class="head"><p>FS_SHORT_ACTN</p></th>
<th class="head"><p>Mode</p></th>
<th class="head"><p>Action Taken</p></th>
</tr>
</thead>
<tbody>
<tr class="row-even"><td rowspan="13"><dl class="simple">
<dt>0 - CONTINUE if in</dt><dd><p>AUTO, or CIRCLE</p>
</dd>
</dl>
</td>
<td><p>MANUAL</p></td>
<td rowspan="8"><dl class="simple">
<dt>CIRCLE unless</dt><dd><p>emergency landing
switch is active,
then FBWA</p>
</dd>
</dl>
</td>
</tr>
<tr class="row-odd"><td><p>ACRO</p></td>
</tr>
<tr class="row-even"><td><p>STABILIZE</p></td>
</tr>
<tr class="row-odd"><td><p>FBWA</p></td>
</tr>
<tr class="row-even"><td><p>FBWB</p></td>
</tr>
<tr class="row-odd"><td><p>CRUISE</p></td>
</tr>
<tr class="row-even"><td><p>AUTOTUNE</p></td>
</tr>
<tr class="row-odd"><td><p>TRAINING</p></td>
</tr>
<tr class="row-even"><td><p>LOITER</p></td>
<td rowspan="5"><p>No Change</p></td>
</tr>
<tr class="row-odd"><td><p>AUTO</p></td>
</tr>
<tr class="row-even"><td><p>THERMAL</p></td>
</tr>
<tr class="row-odd"><td><p>AVOID_ADSB</p></td>
</tr>
<tr class="row-even"><td><p>GUIDED</p></td>
</tr>
</tbody>
</table>

<table class="docutils align-default">
<thead>
<tr class="row-odd"><th class="head"><p>FS_SHORT_ACTN</p></th>
<th class="head"><p>Mode</p></th>
<th class="head"><p>Action Taken</p></th>
</tr>
</thead>
<tbody>
<tr class="row-even"><td rowspan="13"><p>1 -CIRCLE</p></td>
<td><p>MANUAL</p></td>
<td rowspan="8"><dl class="simple">
<dt>CIRCLE unless</dt><dd><p>emergency landing
switch is active,
then FBWA</p>
</dd>
</dl>
</td>
</tr>
<tr class="row-odd"><td><p>ACRO</p></td>
</tr>
<tr class="row-even"><td><p>STABILIZE</p></td>
</tr>
<tr class="row-odd"><td><p>FBWA</p></td>
</tr>
<tr class="row-even"><td><p>FBWB</p></td>
</tr>
<tr class="row-odd"><td><p>CRUISE</p></td>
</tr>
<tr class="row-even"><td><p>AUTOTUNE</p></td>
</tr>
<tr class="row-odd"><td><p>TRAINING</p></td>
</tr>
<tr class="row-even"><td><p>LOITER</p></td>
<td rowspan="5"><p>CIRCLE</p></td>
</tr>
<tr class="row-odd"><td><p>AUTO</p></td>
</tr>
<tr class="row-even"><td><p>THERMAL</p></td>
</tr>
<tr class="row-odd"><td><p>AVOID_ADSB</p></td>
</tr>
<tr class="row-even"><td><p>GUIDED</p></td>
</tr>
</tbody>
</table>

<table class="docutils align-default">
<thead>
<tr class="row-odd"><th class="head"><p>FS_SHORT_ACTN</p></th>
<th class="head"><p>Mode</p></th>
<th class="head"><p>Action Taken</p></th>
</tr>
</thead>
<tbody>
<tr class="row-even"><td rowspan="13"><dl class="simple">
<dt>2 -GLIDE</dt><dd><p>or
4 - FBWB(ALT HOLD)</p>
</dd>
</dl>
</td>
<td><p>MANUAL</p></td>
<td rowspan="8"><dl class="simple">
<dt>GLIDE/FBWB unless</dt><dd><p>emergency landing
switch is active,
then GLIDE</p>
</dd>
</dl>
</td>
</tr>
<tr class="row-odd"><td><p>ACRO</p></td>
</tr>
<tr class="row-even"><td><p>STABILIZE</p></td>
</tr>
<tr class="row-odd"><td><p>FBWA</p></td>
</tr>
<tr class="row-even"><td><p>FBWB</p></td>
</tr>
<tr class="row-odd"><td><p>CRUISE</p></td>
</tr>
<tr class="row-even"><td><p>AUTOTUNE</p></td>
</tr>
<tr class="row-odd"><td><p>TRAINING</p></td>
</tr>
<tr class="row-even"><td><p>LOITER</p></td>
<td rowspan="5"><p>GLIDE/FBWB</p></td>
</tr>
<tr class="row-odd"><td><p>AUTO</p></td>
</tr>
<tr class="row-even"><td><p>THERMAL</p></td>
</tr>
<tr class="row-odd"><td><p>AVOID_ADSB</p></td>
</tr>
<tr class="row-even"><td><p>GUIDED</p></td>
</tr>
</tbody>
</table>

<a id="long-failsafe-action-fs-long-actn"></a>

### Long failsafe action ([FS\_LONG\_ACTN](https://ardupilot.org/plane/docs/parameters.html#fs-long-actn) )

The action to take on a long ([FS\_LONG\_TIMEOUT](https://ardupilot.org/plane/docs/parameters.html#fs-long-timeout) seconds) RC failsafe event.

No Action is ever taken for Long FailSafe in these modes:

- RTL
- QRTL
- QLAND
- LOITER to Alt and QLAND

In QuadPlanes, Long FailSafe will force QLAND by default, RTL if bit 20 of [Q\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#q-options) is set, or QRTL if bit 5 of [Q\_OPTIONS](https://ardupilot.org/plane/docs/parameters.html#q-options) is set, if entered from these modes:

- QSTABILIZE
- QHOVER
- QLOITER
- QACRO
- QAUTOTUNE

Otherwise:

<table class="docutils align-default">
<thead>
<tr class="row-odd"><th class="head"><p>FS_LONG_ACTN</p></th>
<th class="head"><p>Mode</p></th>
<th class="head"><p>Action Taken</p></th>
</tr>
</thead>
<tbody>
<tr class="row-even"><td rowspan="15"><dl class="simple">
<dt>0 - CONTINUE if in</dt><dd><p>AUTO, or RTL</p>
</dd>
</dl>
</td>
<td><p>MANUAL</p></td>
<td rowspan="12"><dl class="simple">
<dt>RTL unless</dt><dd><p>emergency landing
switch is active,
then GLIDE</p>
</dd>
</dl>
</td>
</tr>
<tr class="row-odd"><td><p>ACRO</p></td>
</tr>
<tr class="row-even"><td><p>STABILIZE</p></td>
</tr>
<tr class="row-odd"><td><p>FBWA</p></td>
</tr>
<tr class="row-even"><td><p>FBWB</p></td>
</tr>
<tr class="row-odd"><td><p>CRUISE</p></td>
</tr>
<tr class="row-even"><td><p>AUTOTUNE</p></td>
</tr>
<tr class="row-odd"><td><p>TRAINING</p></td>
</tr>
<tr class="row-even"><td><p>LOITER</p></td>
</tr>
<tr class="row-odd"><td><p>THERMAL</p></td>
</tr>
<tr class="row-even"><td><p>CIRCLE</p></td>
</tr>
<tr class="row-odd"><td><p>TAKEOFF</p></td>
</tr>
<tr class="row-even"><td><p>AUTO</p></td>
<td rowspan="3"><p>No Change</p></td>
</tr>
<tr class="row-odd"><td><p>AVOID_ADSB</p></td>
</tr>
<tr class="row-even"><td><p>GUIDED</p></td>
</tr>
</tbody>
</table>

<table class="docutils align-default">
<thead>
<tr class="row-odd"><th class="head"><p>FS_LONG_ACTN</p></th>
<th class="head"><p>Mode</p></th>
<th class="head"><p>Action Taken</p></th>
</tr>
</thead>
<tbody>
<tr class="row-even"><td rowspan="15"><p>1 - RTL</p></td>
<td><p>MANUAL</p></td>
<td rowspan="12"><dl class="simple">
<dt>RTL unless</dt><dd><p>emergency landing
switch is active,
then GLIDE</p>
</dd>
</dl>
</td>
</tr>
<tr class="row-odd"><td><p>ACRO</p></td>
</tr>
<tr class="row-even"><td><p>STABILIZE</p></td>
</tr>
<tr class="row-odd"><td><p>FBWA</p></td>
</tr>
<tr class="row-even"><td><p>FBWB</p></td>
</tr>
<tr class="row-odd"><td><p>CRUISE</p></td>
</tr>
<tr class="row-even"><td><p>AUTOTUNE</p></td>
</tr>
<tr class="row-odd"><td><p>TRAINING</p></td>
</tr>
<tr class="row-even"><td><p>LOITER</p></td>
</tr>
<tr class="row-odd"><td><p>THERMAL</p></td>
</tr>
<tr class="row-even"><td><p>CIRCLE</p></td>
</tr>
<tr class="row-odd"><td><p>TAKEOFF</p></td>
</tr>
<tr class="row-even"><td><p>AUTO</p></td>
<td rowspan="3"><p>RTL</p></td>
</tr>
<tr class="row-odd"><td><p>AVOID_ADSB</p></td>
</tr>
<tr class="row-even"><td><p>GUIDED</p></td>
</tr>
</tbody>
</table>

<table class="docutils align-default">
<thead>
<tr class="row-odd"><th class="head"><p>FS_LONG_ACTN</p></th>
<th class="head"><p>Mode</p></th>
<th class="head"><p>Action Taken</p></th>
</tr>
</thead>
<tbody>
<tr class="row-even"><td rowspan="15"><dl class="simple">
<dt>2 - GLIDE or</dt><dd><p>4- AUTO or
3- PARACHUTE</p>
</dd>
</dl>
</td>
<td><p>MANUAL</p></td>
<td rowspan="12"><dl class="simple">
<dt>GLIDE,AUTO or PARACHUTE</dt><dd><p>unless emergency
landing switch is
active, then GLIDE</p>
</dd>
</dl>
</td>
</tr>
<tr class="row-odd"><td><p>ACRO</p></td>
</tr>
<tr class="row-even"><td><p>STABILIZE</p></td>
</tr>
<tr class="row-odd"><td><p>FBWA</p></td>
</tr>
<tr class="row-even"><td><p>FBWB</p></td>
</tr>
<tr class="row-odd"><td><p>CRUISE</p></td>
</tr>
<tr class="row-even"><td><p>AUTOTUNE</p></td>
</tr>
<tr class="row-odd"><td><p>TRAINING</p></td>
</tr>
<tr class="row-even"><td><p>LOITER</p></td>
</tr>
<tr class="row-odd"><td><p>THERMAL</p></td>
</tr>
<tr class="row-even"><td><p>CIRCLE</p></td>
</tr>
<tr class="row-odd"><td><p>TAKEOFF</p></td>
</tr>
<tr class="row-even"><td><p>AUTO</p></td>
<td rowspan="3"><p>GLIDE,AUTO or PARACHUTE</p></td>
</tr>
<tr class="row-odd"><td><p>AVOID_ADSB</p></td>
</tr>
<tr class="row-even"><td><p>GUIDED</p></td>
</tr>
</tbody>
</table>

<a id="gcs-failsafe-enable-fs-gcs-enabl"></a>

### GCS failsafe enable ([FS\_GCS\_ENABL](https://ardupilot.org/plane/docs/parameters.html#fs-gcs-enabl) )

Enable ground control station telemetry failsafe. Failsafe will trigger after [FS\_LONG\_TIMEOUT](https://ardupilot.org/plane/docs/parameters.html#fs-long-timeout) seconds of no MAVLink heartbeat or RC Override messages.

Warning

Enabling this option opens up the possibility of your plane going into failsafe mode and running the motor on the ground if it loses contact with your ground station. While the code attempts to verify that the plane is indeed flying and not on the ground before entering this failsafe, it is safer if this option is enabled on an electric plane, to either use a separate motor arming switch or remove the propeller in any ground testing, if possible.

There are three possible enabled settings. Seeing [FS\_GCS\_ENABL](https://ardupilot.org/plane/docs/parameters.html#fs-gcs-enabl) to 1 means that GCS failsafe will be triggered when the aircraft has not received a MAVLink HEARTBEAT message. Setting [FS\_GCS\_ENABL](https://ardupilot.org/plane/docs/parameters.html#fs-gcs-enabl) to 2 means that GCS failsafe will be triggered on either a loss of HEARTBEAT messages, or a RADIO\_STATUS message from a MAVLink enabled telemetry radio indicating that the ground station is not receiving status updates from the aircraft, which is indicated by the RADIO\_STATUS.remrssi field being zero (this may happen if you have a one way link due to asymmetric noise on the ground station and aircraft radios).Setting [FS\_GCS\_ENABL](https://ardupilot.org/plane/docs/parameters.html#fs-gcs-enabl) to 3 means that GCS failsafe will be triggered by Heartbeat(like option one), but only in AUTO mode. WARNING: Enabling this option opens up the possibility of your plane going into failsafe mode and running the motor on the ground it it loses contact with your ground station. If this option is enabled on an electric plane then you should enable [ARMING\_REQUIRE](https://ardupilot.org/plane/docs/parameters.html#arming-require).

| VALUE | MEANING |
| --- | --- |
| 0 | Disabled |
| 1 | Heartbeat |
| 2 | Heartbeat and REMRSSI |
| 3 | Heartbeat and AUTO |

<a id="ekf-failsafe"></a>

## EKF Failsafe

QuadPlanes also have an EKF failsafe which acts when the position estimate becomes untrustworthy while flying in a VTOL mode that requires position. The vehicle switches to [QLAND](https://ardupilot.org/plane/docs/qland-mode.html#qland-mode) if in a VTOL AUTO mission, or to [QHOVER](https://ardupilot.org/plane/docs/qhover-mode.html#qhover-mode) otherwise. In fixed wing flight no failsafe action is taken, as ArduPilot falls back to the DCM attitude estimator.

See [EKF Failsafe](https://ardupilot.org/plane/docs/common-ekf-inav-failsafe.html#common-ekf-inav-failsafe) for full details, including the [FS\_EKF\_THRESH](https://ardupilot.org/plane/docs/parameters.html#fs-ekf-thresh) parameter used to adjust its sensitivity.

<a id="failsafe-diagnosis-in-logs-or-gcs"></a>

## Failsafe Diagnosis in Logs or GCS

GCSs will often display text indicating the type of failsafe encountered, such as “Failsafe Short event on: type=1/reason=3”. Type and Reason can be determined using the table below:

| TYPE | MEANING |
| --- | --- |
| 0 | None |
| 1 | Short Failsafe |
| 2 | Long Failsafe |
| 3 | GCS Failsafe |

| REASON | MEANING |
| --- | --- |
| 0 | Unknown |
| 1 | RC Command |
| 2 | GCS Command |
| 3 | Radio Failsafe |
| 4 | Battery Failsafe |
| 5 | GCS Failsafe |
| 6 | EKF Failsafe |
| 7 | GPS Glitch |
| 10 | Fence Breached |
| 11 | Terrain |
| 19 | Crash |
| 25+ | General unspecific |

<a id="independent-watchdog"></a>

## Independent Watchdog

See [Independent Watchdog and Crash Dump](https://ardupilot.org/plane/docs/common-watchdog.html#common-watchdog) for details.
