---
title: "Telemetry Settings | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/telemetry.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "6ab3b7ba7efb88e76f516ae50d1fe6c5500f2bee48f07c9e1892d4b6f74fd881"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Telemetry Settings | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/telemetry.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="telemetry-settings"></a>

# Telemetry Settings

The Telemetry settings (**App Settings \> Telemetry**) allow you to configure options and view information specific to MAVLink communications. This includes setting the MAVLink system ID for *QGroundControl* and viewing link quality.

The screen also allows you to manage [MAVLink 2 Log Streaming](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/telemetry.html#logging) (PX4 only), including *automating log upload to Flight Review*!

<a id="ground_station"></a>

## Ground Station

This section sets the MAVLink properties and behaviour of *QGroundControl*.

- **MAVLink System ID:** System ID of *QGroundControl* on the MAVLink network (Default: 255). Vehicles are typically allocated IDs from 1. You may have to specify another ID if there are multiple ground stations or MAVLink applications on the network.
- **Emit heartbeat:** Disable emission of regular MAVLink HEARTBEAT message (Default: True). Generally speaking, you should not turn this off.
- **Only accept MAVs with the same protocol version:** Set true to only connect to MAVLink 1 or to MAVLink 2 vehicles (Default: True).
- **Enable MAVLink forwarding:** Enable *QGroundControl* to forward MAVLink messages from connected vehicles to another UDP endpoint (Default: False). Note that this forwarding is one-way: from QGC to the specified host. Any MAVLink messages that are received from the specified host will be ignored.

<a id="link_status"></a>

## Link Status

This shows the status of MAVLink message transfer over the communications link. A high **Loss rate** may lead to protocol errors for things like parameter download or mission upload/download.

<a id="signing"></a>

## MAVLink 2 Signing

The *MAVLink 2 Signing* section (under **App Settings \> Telemetry**) allows you to manage signing keys used for [MAVLink 2 message signing](https://mavlink.io/en/guide/message_signing.html). When signing is enabled, all messages between QGroundControl and the vehicle are cryptographically authenticated, preventing unauthorized command injection.

<a id="key-management"></a>

### Key Management

- **Add Key:** Enter a friendly name and a passphrase. The passphrase is SHA-256 hashed to produce the 32-byte signing key. Only the hash is stored — the passphrase is not saved.
- **Enable:** Sends the signing key to the active vehicle via `SETUP_SIGNING`. The vehicle and QGroundControl will both begin signing messages. Only available when no key is currently active.
- **Disable:** Disables signing on the active vehicle by sending an all-zero key. Only shown for the currently active key.
- **Delete:** Removes a key from QGroundControl's key store. Not available for keys that are in use by any connected vehicle. A warning is shown because the vehicle may still have the key configured — deleting it locally means you can no longer communicate with that vehicle over a signed connection.

<a id="auto-detection"></a>

### Auto-Detection

When QGroundControl receives signed packets from a vehicle, it automatically tries each stored key to find a match. If a match is found, signing is automatically configured on the link — no manual action is needed. The detected key name is shown in the Signing toolbar indicator.

WARNING

Signing keys should only be sent to the vehicle over secure (wired or encrypted) links. Anyone who intercepts the key can sign messages and send commands to the vehicle.

<a id="logging"></a>

## MAVLink 2 Logging (PX4 only)

The *MAVLink 2 Logging* settings (PX4 only) configure real-time log streaming from PX4 to *QGroundControl* and upload of logs to [Flight Review](https://logs.px4.io).

WARNING

MAVLink 2 Logging cannot be used on "basic" setups because it requires a constant high-rate MAVLink connection to the vehicle (it *may* work over WiFI but will *not* work over a Telemetry link).

TIP

In theory log streaming allows real time analysis of data. At time of writing real-time analysis has not yet been implemented.

The log format is the same as for SD Card logs (downloaded using [Analyze View \> Log Download](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/analyze_view/log_download.html)), but actual data logged may be slightly different because log start/stop time is controlled by *QGroundControl* and because some dropouts may occur when streaming over a lossy channel.

The *MAVLink 2 Logging* section allows you to manually start and stop logging, and to enable automatic capture of logs.

The *MAVLink 2 Log Uploads* section allows you configure uploading of MAVLink logs to [Flight Review](https://logs.px4.io). You can specify all the fields that you would otherwise have to directly enter in the site, and also choose whether logs are automatically or manually uploaded.

The fields are:

- **Email address for Log Uploads:** *Flight Review* will email you a link to the upload at this address. This is important as otherwise you will have no way to access a non-public log after upload.
- **Default Description:** Description/name of flight used for log.
- **Default Upload URL:** URL for upload of the log/log metadata. This is set by default to the *Flight Review* URL.
- **Video URL:** (Optional) URL for video of flight associated with log. This may be included on the Flight Review page to ease analysis.
- **Wind Speed:** Used to aid debugging and filtering (from multiple flights). Allowed values: *Calm* | *Breeze* | *Gale* | *Storm*.
- **Flight Rating:** Used to aid debugging and filtering (from multiple flights). Allowed values: *Crashed (Pilot Error)* | *Crashed (Software or Hardware Issue)* | *Unsatisfactory* | *Good* | *Great*.
- **Additional Feedback:** (Optional). Enter a more detailed description of the flight or behaviour.
- **Make this log publically available:** If set, the log will be visible and searchable on *Flight Review*. If not set, it will only be available via the link emailed on upload.
- **Enable automatic log uploads:** If set, the log will automatically be uploaded on completion.
- **Delete log file after uploading:** If set, the log will automatically deleted after upload.

The *Saved Log Files* section is used to manually manage log uploads. Use the checkboxes and buttons to select logs, and either delete or upload them.

TIP

You can change the parameters in *MAVLink 2 Log Uploads* above to specify separate descriptions for uploaded logs.
