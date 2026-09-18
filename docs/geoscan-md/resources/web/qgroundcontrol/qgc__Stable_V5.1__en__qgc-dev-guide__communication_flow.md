---
title: "Communication Flow | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/communication_flow.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "fe4b3f7853dba717376c5b60f5fe9878bd294cef40e3cf0d59110db4963d19dc"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Communication Flow | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/communication_flow.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="communication-flow"></a>

# Communication Flow

Description of the high level communication flow which takes place during a vehicle auto-connect.

- LinkManager always has a UDP port open waiting for a vehicle heartbeat
- LinkManager detects a new known device type (Pixhawk, SiK Radio, PX4 Flow) that makes a UDP connection to the computer

  - LinkManager creates a new SerialLink between the computer and the device
- Incoming bytes from the Link are sent to MAVLinkProtocol
- MAVLinkProtocol converts the bytes into a MAVLink message
- If the message is a `HEARTBEAT` the MultiVehicleManager is notified
- MultiVehicleManager is notified of the `HEARTBEAT` and creates a new vehicle object based on the information in the `HEARTBEAT` message
- The vehicle object instantiates the plugins that matches the vehicle
- The ParameterLoader associated with the vehicle object sends a `PARAM_REQUEST_LIST` to the connected device to load parameters using the parameter protocol
- Once the parameter load is complete, the MissionManager associated with the vehicle object requests the mission items from the connected device using the mission protocol
- Once parameter load is complete, the VehicleComponents display their UI in the Setup view
