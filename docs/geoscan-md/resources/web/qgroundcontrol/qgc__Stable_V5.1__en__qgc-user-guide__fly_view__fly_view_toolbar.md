---
title: "Fly View Toolbar | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view_toolbar.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "c3f4a8ba1e7dc989efe2507c90de7c91efc20cf5c090e8b177b090bc9751025d"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Fly View Toolbar | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/fly_view/fly_view_toolbar.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="fly-view-toolbar"></a>

# Fly View Toolbar

<a id="views"></a>

## Views

The "Q" icon on the left of the toolbar allows you to select between additional top level views:

- **[Plan Flight](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html):** Used to create missions, geo-fences and rally points
- **Analyze Tools:** A set of tools for things like log download, geo-tagging images, or viewing telemetry.
- **Vehicle Configuration:** The various options for the initial configuration of a new vehicle.
- **Application Settings:** Settings for the QGroundControl application itself.

<a id="toolbar-indicators"></a>

## Toolbar Indicators

Next are multiple toolbar indicators for vehicle status. The dropdowns for each toolbar indicator provide additional detail on status. You can also expand the indicators to show additional application and vehicle settings associated with the indicator. Press the "\>" button to expand.

<a id="flight-status"></a>

### Flight Status

[Flight Status indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/main_status_indicator.OI9KqRXV.png)

The Flight Status indicator shows you whether the vehicle is ready to fly or not. It can be in one of the following states:

- **Ready To Fly** (*green background*) - Vehicle is ready to fly
- **Ready To Fly** (*yellow background*) - Vehicle is ready to fly in the current flight mode. But there are warnings which may cause problems.
- **Not Ready** - Vehicle is not ready to fly and will not takeoff.
- **Armed** - Vehicle is armed and ready to Takeoff.
- **Flying** - Vehicle is in the air and flying.
- **Landing** - Vehicle is in the process of landing.
- **Communication Lost** - QGroundControl has lost communication with the vehicle.

The Flight Status indicator dropdown also gives you access to:

- **Arm** - Arming a vehicle starts the motors in preparation for takeoff. You will only be able to arm the vehicle if it is safe and ready to fly. Generally you do not need to manually arm the vehicle. You can simply takeoff or start a mission and the vehicle will arm itself.
- **Disarm** - Disarming a vehicle is only available when the vehicle is on the ground. It will stop the motors. Generally you do not need to explicitly disarm as vehicles will disarm automatically after landing, or shortly after arming if you do not take off.
- **Emergency Stop** - Emergency stop is used to disarm the vehicle while it is flying. For emergency use only, your vehicle will crash!

In the cases of warnings or not ready state you can click the indicator to display the dropdown which will show the reason(s) why. The toggle on the right expands each error with additional information and possible solutions.

Once each issue is resolved it will disappear from the UI. When all issues blocking arming have been removed you should now be ready to fly.

<a id="flight-mode"></a>

### Flight Mode

[Flight Mode indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/flight_modes_indicator.OvXAWxvm.png)

The Flight Mode indicator shows you the current flight mode. The dropdown allows you to switch between flight modes. The expanded page allows you to:

- Configure vehicle land settings
- Set global geo-fence settings
- Add/Remove flight modes from the displayed list

<a id="vehicle-messages"></a>

### Vehicle Messages

[Vehicle Messages indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/messages_indicator.DtTATawA.png)

The Vehicle Messages indicator dropdown shows you messages which come from the vehicle. The indicator will turn red if there are important messages available.

<a id="gps-rtk-gps"></a>

### GPS / RTK GPS

[GPS / RTK GPS indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/gps_indicator.vUYPVsIf.png)

The GPS/RTK GPS indicator shows satellite and GNSS status in the toolbar, and the dropdown provides additional GPS details.

With an active vehicle, the indicator shows vehicle GPS information (for example, satellite count and HDOP), and the expanded page provides access to RTK-related settings.

When there is no active vehicle but RTK is connected, the indicator switches to RTK status so you can still monitor the correction link.

<a id="gps-resilience"></a>

### GPS Resilience

The GPS Resilience indicator appears when the vehicle reports GPS resilience telemetry (authentication, spoofing, or jamming state). The dropdown provides summary status and per-GPS details when available.

<a id="battery"></a>

### Battery

[Battery indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/battery_indicator.pkKUirsy.png)

The Battery indicator shows you a configurable colored battery icon for remaining charge. It can also be configured to show percent remaining, voltage or both. The expanded page allows you to:

- Set what value(s) you want displayed in the battery icon
- Configure the icon coloring
- Set up the low battery failsafe

<a id="remote-id"></a>

### Remote ID

[Remote ID indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/remote_id_indicator.57MimBJE.png)

The Remote ID indicator appears when Remote ID is available on the active vehicle. Its color indicates overall Remote ID health, and the dropdown shows Remote ID status details.

<a id="esc"></a>

### ESC

[ESC indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/esc_indicator.CdTVf2dz.png)

The ESC indicator appears when ESC telemetry is available from the vehicle. It shows overall ESC health and online motor count, and opens a detailed ESC status page.

<a id="joystick"></a>

### Joystick

[Joystick indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/joystick_indicator.CvQpfLTq.png)

The Joystick indicator appears when a joystick/gamepad is detected. The dropdown shows device status and connection details.

<a id="telemetry-rssi"></a>

### Telemetry RSSI

[Telemetry RSSI indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/telemetry_rssi_indicator.sqIbPabv.png)

The Telemetry RSSI indicator appears when telemetry signal information is available. It provides local/remote RSSI and additional radio link quality details.

<a id="rc-rssi"></a>

### RC RSSI

[RC RSSI indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/rc_rssi_indicator.DJ63k8bM.png)

The RC RSSI indicator appears when RC signal information is available. It shows current RC link strength and opens a page with RC RSSI details.

<a id="gimbal"></a>

### Gimbal

[Gimbal indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/gimbal_indicator.CZ4UblpI.png)

The Gimbal indicator is shown when the vehicle supports the [MAVLink Gimbal Protocol](https://mavlink.io/en/services/gimbal_v2.html). It displays active gimbal status and provides access to gimbal controls and settings.

<a id="vtol-transitions"></a>

### VTOL Transitions

[VTOL indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/vtol_indicator.Z_A0a2DN.png)

For VTOL vehicles, a VTOL transition status indicator is shown when applicable. It indicates the current VTOL mode/state and provides transition-related status information.

<a id="mavlink-signing"></a>

### MAVLink Signing

The MAVLink Signing indicator appears when signing keys have been configured (see [MAVLink 2 Signing](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/telemetry.html#signing)). It shows a lock icon that indicates whether MAVLink 2 message signing is active on the current vehicle connection:

- **Locked (green):** Signing is active — the vehicle's incoming packets matched a stored key, or a key was manually enabled.
- **Unlocked:** Signing is not active on the current connection.

The dropdown shows the signing status, the name of the active key (if any), and the number of saved keys. Expanding the indicator provides full key management: you can enable a key on the vehicle, disable the active key, delete unused keys, or add new keys.

<a id="multi-vehicle-selector"></a>

### Multi-Vehicle Selector

[Multi-Vehicle indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/multi_vehicle_indicator.DGpCUqMQ.png)

The Multi-Vehicle selector appears when more than one vehicle is connected. It allows you to quickly switch the active vehicle from the toolbar.

<a id="apm-support-forwarding"></a>

### APM Support Forwarding

[APM Support Forwarding indicator](https://docs.qgroundcontrol.com/Stable_V5.1/assets/apm_support_indicator.B3os_yGP.png)

On ArduPilot, an APM Support Forwarding indicator appears when MAVLink traffic forwarding to a support server is enabled.
