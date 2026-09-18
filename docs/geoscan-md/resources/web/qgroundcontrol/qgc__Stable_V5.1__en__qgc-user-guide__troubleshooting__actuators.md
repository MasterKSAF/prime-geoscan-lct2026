---
title: "Missing Actuators Page (PX4) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/actuators.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "4e413b04078f6dc874bd1e9814670ee36f0a15cac9d5f7c1a0d0d09853e49792"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Missing Actuators Page (PX4) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/actuators.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="missing-actuators-page-px4"></a>

# Missing Actuators Page (PX4)

The [Actuators page](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/px4/actuators.html) is shown when QGroundControl receives and initializes the vehicle's `COMP_METADATA_TYPE_ACTUATORS` component metadata. The firmware version alone does not determine whether the page is available. If the metadata is unavailable, cannot be initialized, or its top-level `show-ui-if` condition evaluates to false, QGroundControl uses the legacy Motors page instead.

<a id="capture-diagnostic-logs"></a>

## Capture Diagnostic Logs

1. Open **Application Settings \> App Log Viewer**.
2. Click **Categories** and enable these categories:

   - `Vehicle.Actuators.PX4AutoPilotPlugin`
   - `Vehicle.Actuators.Common`
   - `ComponentInformation.RequestMetaDataTypeStateMachine`
   - `Vehicle.FTPManager`
3. Connect the vehicle. If it is already connected, disconnect and reconnect it so that QGroundControl requests the component metadata again.
4. Open **Vehicle Setup** and check whether **Actuators** or **Motors** is available.
5. Return to **App Log Viewer** and click **Save**. Keep the saved app log unchanged when attaching it to a support request.

The metadata URI can use MAVLink FTP (`mavlinkftp://`) or HTTP. QGroundControl tries the primary URI first and then the fallback URI advertised by the vehicle.

<a id="read-the-diagnostic-messages"></a>

## Read the Diagnostic Messages

| Log category | Message or pattern | Meaning |
| --- | --- | --- |
| `Vehicle.Actuators.PX4AutoPilotPlugin` | `Vehicle did not provide actuators metadata via component information` | No actuator metadata was received from the vehicle. |
| `Vehicle.Actuators.PX4AutoPilotPlugin` | `Actuators initialization failed` | Metadata was received but could not be parsed or initialized. |
| `Vehicle.Actuators.PX4AutoPilotPlugin` | `Condition 'show-ui-if' evaluated to false` | The vehicle's metadata indicated the page should not be shown. This can be intentional for your configuration, or a firmware/metadata mismatch. Attach the saved log to a support request. |
| `ComponentInformation.RequestMetaDataTypeStateMachine` | `primary failed, requesting metadata (fallback) from ...` | The primary metadata URI failed and QGroundControl is trying the fallback URI. |
| `ComponentInformation.RequestMetaDataTypeStateMachine` | `FTP download failed` or `HTTP download failed` | The selected transport could not download the metadata. An HTTP status such as `404` identifies a missing or incorrect URL. |
| `ComponentInformation.RequestMetaDataTypeStateMachine` | `failed to load metadata (primary and fallback)` | Both metadata URIs failed, so the Actuators page cannot be initialized. |
| `Vehicle.FTPManager` | `Download fromCompId`, `Nak - ...`, or timeout messages | Details of the MAVLink FTP request and any vehicle-side error. |

<a id="include-this-information-in-a-support-request"></a>

## Include This Information in a Support Request

Include the QGroundControl version and build, PX4 firmware version, vehicle type, connection type, whether the legacy Motors page appears, and the saved app log. If the log contains a fallback or download error, include the full line with the URI and error text. Also mention whether reconnecting the vehicle changes the result.
