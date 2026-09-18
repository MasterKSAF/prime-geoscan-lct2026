---
title: "Mission Commands — Mission Planner  documentation"
source_url: "https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html"
retrieved_at: "2026-09-15T18:22:21.712150+00:00"
source_sha256: "207ac199c625b5faa27759e2967489b728e6827b51be60cdbb8598a2c572ecc7"
license: "CC BY-SA 3.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Mission Commands — Mission Planner  documentation](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html). Авторы: ArduPilot Wiki contributors. Лицензия: [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

> Метка `[UNSUPPORTED IN SOURCE]` перенесена из серого цвета 93 строк таблиц исходного справочника; это не результат нашего испытания.

<a id="mission-commands"></a>

<a id="common-mavlink-mission-command-messages-mav-cmd"></a>

# Mission Commands

This article describes the mission commands that are supported by Copter, Plane, Sub and Rover when switched into Auto mode.

Note

there are many other MAVLink commands that a GCS or other device can send to the autopilot. See the ArduPilot/navlink repository, or the documentation for your GCS.

<a id="overview"></a>

## Overview

The MAVLink protocol defines a large number of [MAV\_CMD](https://github.com/ArduPilot/mavlink/blob/master/message_definitions/v1.0/common.xml#L1008) waypoint command types (sent in a `MAVLink_mission_item_message`). ArduPilot implements handling for the subset of these commands and command parameters that are *most relevant* and meaningful for each of the vehicles. Unsupported commands that are sent to a particular autopilot will simply be dropped.

This article lists and describes the commands and command-parameters that are supported on each of the vehicle types. Any parameter that is “grey” is not supported by the autopilot and will be ignored. They are still documented to make it clear which properties are supported by the [MAV\_CMD protocol](https://github.com/ArduPilot/mavlink/blob/master/message_definitions/v1.0/common.xml#L1008) are not implemented by the vehicle.

Some commands and command parameters are not implemented because they are not relevant for particular vehicle types (for example “MAV\_CMD\_NAV\_TAKEOFF” command makes sense for Plane and Copter but not Rover and the pitch parameter only makes sense for Plane). There are also some potentially useful command parameters that are not handled because there is a limit to the message size, and a decision has been made to prioritize some parameters over others.

Note

There is additional information about the supported commands on Copter (from a Mission Planner perspective) in the [Copter Mission Command List](https://ardupilot.org/copter/docs/mission-command-list.html#mission-command-list).

<a id="types-of-commands"></a>

### Types of commands

There are several different types of commands that can be used within missions:

- Navigation commands are used to control the movement of the vehicle, including takeoff, moving to and around waypoints, changing altitude, and landing.
- DO commands are for auxiliary functions and do not affect the vehicle’s position (for example, setting the camera trigger distance, or setting a servo value).
- Condition commands are used to delay DO commands until some condition is met, for example, the UAV reaches a certain altitude or distance from the waypoint.

During a mission at most one “Navigation” command and one “Do” or “Condition” command can be running at one time. A typical mission might set a waypoint (NAV command), add a CONDITION command that doesn’t complete until a certain distance from the destination ([MAV\_CMD\_CONDITION\_DISTANCE](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#mav-cmd-condition-distance)), and then add a number of DO commands that are executed sequentially (for example [MAV\_CMD\_DO\_SET\_CAM\_TRIGG\_DIST](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#mav-cmd-do-set-cam-trigg-dist) to take pictures at regular intervals) when the condition completes.

Note

CONDITION and DO commands are associated with the preceding NAV command: if the UAV reaches the next waypoint before these commands are executed, the next NAV command is loaded and they will be skipped.

<a id="frames-of-reference"></a>

<a id="common-mavlink-mission-command-messages-mav-cmd-navigation-commands-frames"></a>

### Frames of reference

Many of the commands (in particular the [NAV\_ commands](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#common-mavlink-mission-command-messages-mav-cmd-navigation-commands)) include position/location information. The information is provided relative to a particular “frame of reference”, which is specified in the message’s [Frames of reference](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#common-mavlink-mission-command-messages-mav-cmd-navigation-commands-frames) field. Copter and Rover Mission use [MAV\_CMD\_DO\_SET\_HOME](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#mav-cmd-do-set-home) command to set the “home position” in the global coordinate frame (MAV\_FRAME\_GLOBAL), [WGS84 coordinate system](https://en.wikipedia.org/wiki/World_Geodetic_System), where the altitude is relative to mean sea level. All other commands use the MAV\_FRAME\_GLOBAL\_RELATIVE\_ALT frame, which uses the same latitude and longitude, but sets altitude as relative to the *home position* (home altitude = 0).

Plane commands can additionally use MAV\_FRAME\_GLOBAL\_TERRAIN\_ALT frame of reference. This again has the same WGS84 frame of reference for latitude/longitude, but specifies altitude relative to ground height (as defined in a terrain database).

Note

The other frame types are defined in the MAVLink protocol (see [MAV\_FRAME](https://github.com/ArduPilot/mavlink/blob/master/message_definitions/v1.0/common.xml#L795)) are not supported for mission commands.

<a id="how-accurate-is-the-information"></a>

### How accurate is the information?

If a command or parameter is marked as supported then it is likely (but not guaranteed) that it will behave as indicated. If a command or parameter is not listed (or marked as not supported) then it is extremely likely that it is not supported on ArduPilot.

The reason for this is that the information was predominantly inferred by inspecting the command handlers for messages:

- The switch statement in [AP\_Mission::mavlink\_to\_mission\_cmd](https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Mission/AP_Mission.cpp#L466) was inspected to determine which commands are handled by *all* vehicle platforms, and which parameters from the message are stored.
- The command handler switch for each vehicle type ([Plane](https://github.com/ArduPilot/ardupilot/blob/master/ArduPlane/commands_logic.cpp#L33), [Copter](https://github.com/ArduPilot/ardupilot/blob/master/ArduCopter/commands_logic.cpp#L49), [Rover](https://github.com/ArduPilot/ardupilot/blob/master/Rover/commands_logic.cpp#L25)) tells us which commands are likely to be supported in each vehicle and which parameters are passed to the handler.

The above checks give a very accurate picture of what commands and parameters are not supported. They give a fairly accurate picture of what commands/parameters are *likely to be supported*. However, this indication is not guaranteed to be accurate because a command handler could just throw away all the information (and we have not fully checked all of these).

In addition to the above checks, we have also merged information from the [Copter Mission Command List](https://ardupilot.org/copter/docs/mission-command-list.html#mission-command-list).

<a id="how-to-interpret-the-command-parameters"></a>

### How to interpret the command parameters

The parameters for each command are listed in a table. The parameters that are “greyed out” are not supported. The command field column (param name) uses “bold” text to indicate those parameters that are defined in the protocol (normal text is used for “empty” parameters).

This allows users/developers to see both what is supported, and what protocol fields are not supported in ArduPilot.

<a id="using-this-information-with-a-gcs"></a>

### Using this information with a GCS

*Mission Planner* (MP) exposes the full subset of commands and parameters supported by ArduPilot, filtered to display just those relevant to the currently connected vehicle. Mapping the MP commands to this documentation is easy, because it simply names commands using a cut-down version of the full command name (e.g. `DO_SET_SERVO` rather than the full command name: `MAV_CMD_DO_SET_SERVO`). In addition, this document conveniently lists the column label used by Mission Planner alongside each of the parameters.

Other GCSs (APM Planner 2, Tower etc.) may support some other subset of commands/parameters and use alternative names/labels for them. In most cases, the mapping should be obvious.

<a id="navigation-commands"></a>

<a id="common-mavlink-mission-command-messages-mav-cmd-navigation-commands"></a>

## Navigation commands

Navigation commands are used to control the movement of the vehicle, including takeoff, moving to and around waypoints, and landing.

NAV commands have the highest priority. Any DO\_ and CONDITION\_ commands that have not executed when a NAV command is loaded are skipped (for example, if a waypoint completes and the NAV command for another waypoint is loaded, and unexecuted DO/CONDITION commands associated with the first waypoint are dropped.

<a id="mav-cmd-nav-waypoint"></a>

<a id="id1"></a>

### MAV\_CMD\_NAV\_WAYPOINT

Supported by: All vehicles.

Navigate to the specified position.

<a id="mav-cmd-nav-loiter-unlim"></a>

<a id="mav-cmd-nav-takeoff"></a>

<a id="id2"></a>

### MAV\_CMD\_NAV\_LOITER\_UNLIM

Supported by: All vehicles.

Loiter at the specified location for an unlimited amount of time.

<a id="mav-cmd-nav-loiter-time"></a>

<a id="mav-cmd-nav-loiter-turns"></a>

<a id="id3"></a>

### MAV\_CMD\_NAV\_LOITER\_TIME

Supported by: Copter, Plane, Rover.

<a id="mav-cmd-nav-return-to-launch"></a>

<a id="id4"></a>

### MAV\_CMD\_NAV\_RETURN\_TO\_LAUNCH

Supported by: All vehicles.

Return to the *home location* or the nearest [Rally Point](https://ardupilot.org/planner/docs/common-rally-points), if closer. The home location is where the vehicle was last armed (or when it first gets GPS lock after arming if the vehicle configuration allows this).

<a id="mav-cmd-nav-delay"></a>

<a id="mav-cmd-nav-altitude-wait"></a>

<a id="mav-cmd-nav-guided-enable"></a>

<a id="mav-cmd-nav-spline-waypoint"></a>

<a id="mav-cmd-nav-continue-and-change-alt"></a>

<a id="mav-cmd-nav-land"></a>

<a id="id5"></a>

### MAV\_CMD\_NAV\_DELAY

Supported by: Copter, Rover, Plane.

<a id="mav-cmd-nav-payload-place"></a>

<a id="id6"></a>

### MAV\_CMD\_NAV\_PAYLOAD\_PLACE

Supported by: Copter and Plane.

\[wiki site=”copter,plane”\] **Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Maximum Descent | meters |
| param2 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| **param5** | Lat | Latitude. |
| **param6** | Long | Longitude |
| **param7** | Alt | Altitude |

\[/site\]

<a id="mav-cmd-do-jump"></a>

<a id="id7"></a>

### MAV\_CMD\_DO\_JUMP

Supported by: All vehicles.

Jump to the specified command in the mission list. The jump command can be repeated either a specified number of times before continuing the mission, or it can be repeated indefinitely.

Tip

Despite the name, this command is really a “NAV\_” command rather than a “DO\_” command. Conditional commands like CONDITION\_DELAY don’t affect DO\_JUMP (it will always perform the jump as soon as it reaches the command).

Note

- There can be a maximum of 15 jump commands in a mission after which new DO\_JUMP commands are ignored.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | WP# | The command index/sequence number of the command to jump to. |
| **param2** | Repeat# | Number of times that the DO\_JUMP command will execute before moving to the next sequential command. However, if MIS\_OPTIONS bit 2 is not set, then the repeat count will be used again if the command is encountered again after the last repeat. If the value is zero the next command will execute immediately. A value of -1 will cause the command to repeat indefinitely. |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id28"></a>

 [[../_images/MissionList_DoJump.png](https://ardupilot.org/planner/_images/MissionList_DoJump.png)](https://ardupilot.org/planner/_images/MissionList_DoJump.png)

Mission Planner Settings for DO\_JUMP command

In the example above the vehicle would fly back-and-forth between waypoints #1 and #2 a total of 3 times before flying on to waypoint #4.

<a id="mav-cmd-jump-tag"></a>

<a id="id8"></a>

### MAV\_CMD\_JUMP\_TAG

Supported by: Copter, Plane, Rover.

This is a location marker in the mission command sequence that can be used as a “jump to” location for the [MAV\_CMD\_DO\_JUMP\_TAG](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#mav-cmd-do-jump-tag) command. The tag id in its parameter field can be any arbitrary number between 1 and 65535.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Tag# | The tag number for the DO\_JUMP\_TAG command. |
| param2 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

<a id="mav-cmd-do-jump-tag"></a>

<a id="id9"></a>

### MAV\_CMD\_DO\_JUMP\_TAG

Supported by: Copter, Plane, Rover.

Jump to the specified [MAV\_CMD\_JUMP\_TAG](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#mav-cmd-jump-tag) item in the mission list. The jump tag command can be repeated, either a specified number of times before continuing the mission, or it can be repeated indefinitely.

Tip

Despite the name, this command is really a “NAV\_” command rather than a “DO\_” command. Conditional commands like CONDITION\_DELAY don’t affect DO\_JUMP (it will always perform the jump as soon as it reaches the command).

Note

- There can be a maximum of 15 jump\_tag commands in a mission after which new DO\_JUMP\_TAG commands are ignored.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | WP# | The tag number of the JUMP\_TAG item to jump to. |
| **param2** | Repeat# | Number of times that the DO\_JUMP\_TAG command will execute before moving to the next sequential command. If the value is zero the next command will execute immediately. A value of -1 will cause the command to repeat indefinitely. |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id29"></a>

 [[../_images/MissionList_DoJump_Tag.png](https://ardupilot.org/planner/_images/MissionList_DoJump_Tag.png)](https://ardupilot.org/planner/_images/MissionList_DoJump_Tag.png)

Mission Planner Settings for DO\_JUMP\_TAG command

In the example above, the vehicle would fly back-and-forth between waypoints #3 and #4 a total of 3 times before completing the mission. This is because the DO\_JUMP\_TAG redirects the vehicle to JUMP\_TAG #565 twice.

<a id="conditional-commands"></a>

## Conditional commands

Conditional commands control the execution of \_DO\_ commands. For example, a conditional command can prevent DO commands from executing based on a time delay, until the vehicle is at a certain altitude, or at a specified distance from the next target position.

A conditional command may not be complete before reaching the next waypoint. In this case, any unexecuted \_DO\_ commands associated with the last waypoint will be skipped.

<a id="mav-cmd-condition-delay"></a>

<a id="id10"></a>

### MAV\_CMD\_CONDITION\_DELAY

Supported by: All vehicles.

After reaching a waypoint, delay the execution of the next conditional “\_DO\_” command for the specified number of seconds (e.g. [MAV\_CMD\_DO\_SET\_ROI](https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html#mav-cmd-do-set-roi)).

Note

This command does not stop the vehicle. If the vehicle reaches the next waypoint before the delay timer completes, the delayed “\_DO\_” commands will never trigger.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Time (sec) | Delay in seconds (decimal). |
| param2 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id30"></a>

 [[../_images/MissionList_ConditionDelay.png](https://ardupilot.org/planner/_images/MissionList_ConditionDelay.png)](https://ardupilot.org/planner/_images/MissionList_ConditionDelay.png)

Mission Planner Settings for CONDITION\_DELAY command

In the example above, Command #4 (`DO_SET_ROI`) is delayed so that it starts 5 seconds after the vehicle has passed Waypoint #2.

<a id="mav-cmd-condition-distance"></a>

<a id="id11"></a>

### MAV\_CMD\_CONDITION\_DISTANCE

Supported by: All vehicles.

Delays the start of the next “`_DO_`” command until the vehicle is within the specified number of meters of the next waypoint.

Note

This command does not stop the vehicle: it only affects DO commands.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Dist (m) | Distance from the next waypoint before DO commands are executed (meters). |
| param2 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id31"></a>

 [[../_images/MissionList_ConditionDistance.png](https://ardupilot.org/planner/_images/MissionList_ConditionDistance.png)](https://ardupilot.org/planner/_images/MissionList_ConditionDistance.png)

Mission PlannerSettings for CONDITION\_DISTANCE command

In the example above, Command #4 (`DO_SET_ROI`) is delayed so that it only starts once the vehicle is within 50m of waypoint #5.

<a id="do-commands"></a>

<a id="mav-cmd-condition-yaw"></a>

## DO commands

The “DO” or “Now” commands are executed once to perform some action. All the DO commands associated with a waypoint are executed immediately.

<a id="mav-cmd-do-change-speed"></a>

<a id="id12"></a>

### MAV\_CMD\_DO\_CHANGE\_SPEED

Supported by: Copter, Plane, Rover.

<a id="mav-cmd-do-set-reverse"></a>

<a id="id13"></a>

### MAV\_CMD\_DO\_SET\_REVERSE

Supported by: Rover only.

Sets the vehicle’s driving direction to forward or reverse. This applies to the NAV commands that follow it in the mission, until another MAV\_CMD\_DO\_SET\_REVERSE command changes it again.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Reverse (0/1) | Direction: 0: Forward direction. 1: Reverse direction. |
| param2 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

<a id="mav-cmd-do-set-home"></a>

<a id="id14"></a>

### MAV\_CMD\_DO\_SET\_HOME

Supported by: All vehicles.

Sets the home location either as the current location or at the location specified in the command. For SITL work, altitude input here needs to be with reference to absolute altitude, taking into account SRTM elevation.

Note

- For Plane and Rover, if a good GPS fix cannot be obtained the location specified in the command is used.
- For Copter, the command will also try to use the current position if all the location parameters are set to 0. The location information in the command is only used if it is close to the EKF origin.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Current | Set home location: 1=Set home as current location. 0=Use location specified in message parameters. |
| param2 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| **param5** | Lat | Target home latitude (if `param1=0`) |
| **param6** | Lon | Target home longitude (if `param1=0`) |
| **param7** | Alt | Target home altitude (if `param1=0`) |

**Mission planner screenshots**

<a id="id32"></a>

 [[../_images/MissionList_DoSetHome.png](https://ardupilot.org/planner/_images/MissionList_DoSetHome.png)](https://ardupilot.org/planner/_images/MissionList_DoSetHome.png)

Mission Planner Settings for DO\_SET\_HOME command

<a id="mav-cmd-do-set-relay"></a>

<a id="id15"></a>

### MAV\_CMD\_DO\_SET\_RELAY

Supported by: All vehicles.

Set a [Relay](https://ardupilot.org/planner/docs/common-relay) pin’s voltage high (on) or low (off).

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Relay No | Relay number. |
| **param2** | off(0)/on(1) | Set relay state: 1: Set relay high/on (3.3V on Pixhawk, 5V on APM). 0: Set relay low/off (0v) any other value toggles the relay |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id33"></a>

 [[../_images/MissionPlanner_DO_SET_RELAY.png](https://ardupilot.org/planner/_images/MissionPlanner_DO_SET_RELAY.png)](https://ardupilot.org/planner/_images/MissionPlanner_DO_SET_RELAY.png)

MissionPlanner Settings for DO\_SET\_RELAY command

<a id="mav-cmd-do-repeat-relay"></a>

<a id="id16"></a>

### MAV\_CMD\_DO\_REPEAT\_RELAY

Supported by: All vehicles.

Toggle the [Relay](https://ardupilot.org/sub/docs/common-relay.html#common-relay) pin’s voltage/state a specified number of times with a given period. Toggling the Relay will turn an off relay on and vice versa

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Relay No | Relay number. |
| **param2** | Repeat # | Cycle count - the number of times the relay should be toggled |
| **param3** | Delay(s) | Cycle time (seconds, decimal) - time between each toggle. |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id34"></a>

 [[../_images/MissionList_DoRepeatRelay.png](https://ardupilot.org/planner/_images/MissionList_DoRepeatRelay.png)](https://ardupilot.org/planner/_images/MissionList_DoRepeatRelay.png)

Mission Planner Settings for DO\_RELAY\_REPEAT command

In the example above, assuming the relay was off to begin with, it would be set high and then after 3 seconds, it would be toggled low again.

<a id="mav-cmd-do-set-servo"></a>

<a id="id17"></a>

### MAV\_CMD\_DO\_SET\_SERVO

Supported by: All vehicles.

Set a given [servo pin](https://ardupilot.org/sub/docs/common-servo.html#common-servo) output to a specific PWM value.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Ser No | Servo number - target servo output pin/channel number. |
| **param2** | PWM | PWM value to output, in microseconds (typically 1000 to 2000). |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id35"></a>

 [[../_images/MissionList_DoSetServo.png](https://ardupilot.org/planner/_images/MissionList_DoSetServo.png)](https://ardupilot.org/planner/_images/MissionList_DoSetServo.png)

Mission Planner Settingsfor DO\_SET\_SERVO command

In the example above, the servo attached to output channel 8 would be moved to PWM 1700 (servos generally accept PWM values between 1000 and 2000).

Note

as of firmware versions 4.0 and later, this command can be used on any output configured by its `SERVOx_FUNCTION` command as 0,1, or 51-66 (disabled or RC pass-throughs)

<a id="mav-cmd-do-repeat-servo"></a>

<a id="id18"></a>

### MAV\_CMD\_DO\_REPEAT\_SERVO

Supported by: All vehicles.

Cycle a [servo](https://ardupilot.org/sub/docs/common-servo.html#common-servo) PWM output pin between its mid-position value and a specified PWM value, for a given number of cycles and with a set period.

The mid-position value is specified in the `RCn_TRIM` parameter for the channel (`RC8_TRIM` in the screenshot below). The default value is 1500..

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Ser No | Servo number - target servo output pin/channel. |
| **param2** | PWM | PWM value to output, in microseconds (typically 1000 to 2000). |
| **param3** | Repeat # | Cycle count - number of times to move the servo to the specified PWM value |
| **param4** | Delay (s) | Cycle time (seconds) - the delay in seconds between each servo movement. |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id36"></a>

 [[../_images/MissionList_DoRepeatServo.png](https://ardupilot.org/planner/_images/MissionList_DoRepeatServo.png)](https://ardupilot.org/planner/_images/MissionList_DoRepeatServo.png)

Mission Planner Settingsfor DO\_REPEAT\_SERVO command

In the example above, the servo attached to output channel 8 would be moved to PWM 1700, then after 4 second, back to mid, after another 4 seconds it would be moved to 1700 again, then finally after 4 more seconds it would be moved back to mid.

<a id="mav-cmd-do-set-roi-mav-cmd-doe-set-roi-loocation-mav-cmd-do-set-roi-none"></a>

<a id="mav-cmd-do-set-roi-none"></a>

<a id="mav-cmd-do-set-roi-location"></a>

<a id="mav-cmd-do-set-roi"></a>

<a id="mav-cmd-do-land-start"></a>

### MAV\_CMD\_DO\_SET\_ROI, MAV\_CMD\_DOE\_SET\_ROI\_LOOCATION, MAV\_CMD\_DO\_SET\_ROI\_NONE

Supported by: Copter, Plane, Rover,Sub. Currently, the DO\_SET\_ROI,DO\_SET\_ROI\_LOCATION, and DO\_SET\_ROI\_NONE commands all behave the same with DO\_SET\_ROI\_NONE removing the ROI target, the same as setting the location to 0,0 in the other commands.

<a id="mav-cmd-do-digicam-configure"></a>

<a id="id19"></a>

### MAV\_CMD\_DO\_DIGICAM\_CONFIGURE

Supported by: All vehicles.

Configure an on-board camera controller system.

The parameters are forwarded to an on-board camera controller system (like the [3DR Camera Control Board](https://ardupilot.org/planner/docs/common-camera-control-board)), if one is present.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Mode | Set camera mode: 1: ProgramAuto 2: Aperture Priority 3: Shutter Priority 4: Manual 5: IntelligentAuto 6: SuperiorAuto |
| **param2** | Shutter Speed | Shutter speed (seconds divisor). So if the speed is 1/60 seconds, the value entered would be 60. Slowest shutter trigger supported is 1 second. |
| **param3** | Aperture | Aperture: F stop number |
| **param4** | ISO | ISO number e.g. 80, 100, 200, etc. |
| **param5**  \[UNSUPPORTED IN SOURCE\] | ExposureMode | Exposure type enumerator |
| **param6**  \[UNSUPPORTED IN SOURCE\] | CommandID | Command Identity |
| **param7** | Engine Cut-Off | Main engine cut-off time before camera trigger in seconds/10 (0 means no cut-off). |

<a id="mav-cmd-do-digicam-control"></a>

<a id="id20"></a>

### MAV\_CMD\_DO\_DIGICAM\_CONTROL

Supported by: All vehicles.

Trigger the [camera shutter](https://ardupilot.org/sub/docs/common-camera-shutter-with-servo.html#common-camera-shutter-with-servo) once. This command takes no additional arguments.

**Command parameters**

In general, if a command field is set to 0 it is ignored.

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | On/Off | Session control (on/off or show/hide lens): 0: Turn off the camera / hide the lens 1: Turn on the camera /Show the lens |
| **param2**  \[UNSUPPORTED IN SOURCE\] | Zoom Position | Zoom's absolute position. 2x, 3x, 10x, etc. |
| **param3**  \[UNSUPPORTED IN SOURCE\] | Zoom Step | Zooming step value to offset zoom from the current position |
| **param4** | Focus Lock | Focus Locking, Unlocking or Re-locking: 0: Ignore 1: Unlock 2: Lock |
| **param5** | Shutter Cmd | Shooting Command. Any non-zero value triggers the camera. |
| **param6**  \[UNSUPPORTED IN SOURCE\] | CommandID | Command Identity |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id37"></a>

 [[../_images/MissionList_DoDigicamControl.png](https://ardupilot.org/planner/_images/MissionList_DoDigicamControl.png)](https://ardupilot.org/planner/_images/MissionList_DoDigicamControl.png)

Mission PlannerSettings for DO\_DIGICAM\_CONTROL command.

<a id="mav-cmd-do-mount-control"></a>

<a id="id21"></a>

### MAV\_CMD\_DO\_MOUNT\_CONTROL

Supported by: All vehicles.

Mission command to control a camera or antenna mount.

This command allows you to specify a roll, pitch and yaw angle which will be sent to the [camera gimbal](https://ardupilot.org/sub/docs/common-cameras-and-gimbals.html#common-cameras-and-gimbals). This can be used to point the camera in specific directions at various times in the mission.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** |  | Pitch, in degrees. |
| **param2** |  | Roll, in degrees. |
| **param3** |  | Yaw, in degrees. |
| param4 \[UNSUPPORTED IN SOURCE\] |  | reserved |
| param5 \[UNSUPPORTED IN SOURCE\] |  | reserved |
| param6 \[UNSUPPORTED IN SOURCE\] |  | reserved |
| **param7** |  | [MAV\_MOUNT\_MODE](https://mavlink.io/en/messages/common.html#MAV_MOUNT_MODE) enum value. |

**Mission planner screenshots**

<a id="id38"></a>

 [[../_images/MissionList_DoMountControl.png](https://ardupilot.org/planner/_images/MissionList_DoMountControl.png)](https://ardupilot.org/planner/_images/MissionList_DoMountControl.png)

Mission Planner Settings for DO\_MOUNT\_CONTROL command

<a id="mav-cmd-do-gimbal-manager-pitchyaw"></a>

<a id="id22"></a>

### MAV\_CMD\_DO\_GIMBAL\_MANAGER\_PITCHYAW

Supported by: All vehicles.

Mission command to move the gimbal to the desired pitch and yaw angles (in degrees).

This command allows you to specify a pitch and yaw angle which will be sent to the [camera gimbal](https://ardupilot.org/sub/docs/common-cameras-and-gimbals.html#common-cameras-and-gimbals). This can be used to point the camera in specific directions at various times in the mission. Positive pitch angles are up, Negative are down. Positive yaw angles are clockwise, negative are counter clockwise.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** |  | Pitch, in degrees. |
| **param2** |  | Yaw, in degrees. |
| **param3** |  | PitchRate, in deg/s. |
| **param4** |  | YawRate, in deg/s |
| **param5** |  | Flags: 0=boddyframe, 16=earthframe |
| param6 \[UNSUPPORTED IN SOURCE\] |  | reserved |
| **param7** |  | Gimbal instance ID |

**Mission planner screenshots**

<a id="id39"></a>

 [[../_images/mission-list-do-gimbal-manager-pitchyaw.png](https://ardupilot.org/planner/_images/mission-list-do-gimbal-manager-pitchyaw.png)](https://ardupilot.org/planner/_images/mission-list-do-gimbal-manager-pitchyaw.png)

Mission PlannerSettings for DO\_GIMBAL\_MANAGE\_PITCHYAW command

<a id="mav-cmd-do-set-cam-trigg-dist"></a>

<a id="id23"></a>

### MAV\_CMD\_DO\_SET\_CAM\_TRIGG\_DIST

Supported by: All vehicles.

Trigger the [camera shutter](https://ardupilot.org/sub/docs/common-camera-shutter-with-servo.html#common-camera-shutter-with-servo) at regular distance intervals. This command is useful in [camera survey missions](https://ardupilot.org/planner/docs/common-camera-control-and-auto-missions-in-mission-planner.html#common-camera-control-and-auto-missions-in-mission-planner). To trigger the camera once, immediately after passing the DO command, set param3 to 1.

Note

Providing a distance of zero will stop the camera shutter from being triggered.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Dist (m) | Camera trigger distance interval (meters). Zero to turn off distance triggering. |
| param2 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| **param3** | ? | Trigger once instantly. One is on, zero is off. |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

**Mission planner screenshots**

<a id="id40"></a>

 [[../_images/MissionList_DoSetCamTriggDist.png](https://ardupilot.org/planner/_images/MissionList_DoSetCamTriggDist.png)](https://ardupilot.org/planner/_images/MissionList_DoSetCamTriggDist.png)

Mission PlannerSettings for DO\_SET\_CAM\_TRIGG\_DIST command

The above configuration will cause the camera shutter to trigger after every 5m that the vehicle travels.

<a id="mav-cmd-do-fence-enable"></a>

<a id="id24"></a>

### MAV\_CMD\_DO\_FENCE\_ENABLE

Supported by: All vehicles.

Mission commands to enable the Plane [GeoFence](https://ardupilot.org/plane/docs/geofencing.html#geofencing), Copter/Rover [Cylindrical Fence](https://ardupilot.org/sub/docs/common-ac2_simple_geofence.html#common-ac2-simple-geofence) and/or [Inclusion and Exclusion Fences](https://ardupilot.org/sub/docs/common-polygon_fence.html#common-polygon-fence).

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** |  | Set GeoFence enable state (0=disable, 1=enable, 2= disable only floor (Plane only)). |
| **param2** | bitmask | The target fence is specified by the bitmask value of FENCE\_TYPE. 0 is ALL configured fences. |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

<a id="mav-cmd-do-aux-function"></a>

<a id="id25"></a>

### MAV\_CMD\_DO\_AUX\_FUNCTION

Supported by: All vehicles.

Mission command to control an [Auxiliary Function](https://ardupilot.org/sub/docs/common-auxiliary-functions.html#common-auxiliary-functions) in the same manner as an RC channel switch.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | Aux Function | Auxiliary Function code,same as RCx\_OPTIONS |
| **param2** | Switch Position | 0:Low, 1:Mid, 2:High |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

<a id="mav-cmd-do-set-resume-repeat-dist"></a>

<a id="mav-cmd-do-autotune-enable"></a>

<a id="mav-cmd-do-gripper"></a>

<a id="mav-cmd-do-inverted-flight"></a>

<a id="mav-cmd-do-parachute"></a>

<a id="id26"></a>

### MAV\_CMD\_DO\_SET\_RESUME\_REPEAT\_DIST

Supported by: All vehicles.

Set the distance that the mission will be rewound when resuming after an interrupt (switching modes). A full explanation of this feature can be found on the [Mission Rewind on Resume Page](https://ardupilot.org/planner/docs/common-mission-rewind.html#common-mission-rewind). After setting a rewind distance in a mission, setting the distance to zero will switch off the rewind feature from that point on the mission.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | ? | Rewind distance in meters |
| param2 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |

<a id="mav-cmd-storage-format"></a>

<a id="id27"></a>

### MAV\_CMD\_STORAGE\_FORMAT

Supported by: All vehicles.

Format SD Card. Useful for vehicles where SD card is inaccessible. Param1 and Param2 must be set to 1.

**Command parameters**

| Command Field | Mission Planner Field | Description |
| --- | --- | --- |
| **param1** | ? | Must be 1 |
| **param2** | ? | Must be 1 |
| param3 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param4 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param5 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param6 \[UNSUPPORTED IN SOURCE\] |  | Empty |
| param7 \[UNSUPPORTED IN SOURCE\] |  | Empty |
