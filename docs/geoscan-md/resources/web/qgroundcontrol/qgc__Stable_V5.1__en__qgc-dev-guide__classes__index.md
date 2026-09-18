---
title: "Class Hierarchy (high level) | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/classes/index.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "2d4f93f64478e59aae42a3b30f9aa707ec29874c239820fb0f049b06c2efcaff"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Class Hierarchy (high level) | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/classes/index.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="class-hierarchy-high-level"></a>

# Class Hierarchy (high level)

TIP

Doxygen documentation for classes can be found at [https://api.qgroundcontrol.com/master/annotated.html](https://api.qgroundcontrol.com/master/annotated.html).

<a id="linkmanager-linkinterface"></a>

## LinkManager, LinkInterface

A "Link" in QGC is a specific type of communication pipe with the vehicle such as a serial port or UDP over WiFi. The base class for all links is LinkInterface. Each link runs on it's own thread and sends bytes to MAVLinkProtocol.

The `LinkManager` object keeps track of all open links in the system. `LinkManager` also manages automatic connections through serial and UDP links.

<a id="mavlinkprotocol"></a>

## MAVLinkProtocol

There is a single `MAVLinkProtocol` object in the system. It's job is to take incoming bytes from a link and translate them into MAVLink messages. MAVLink HEARTBEAT messages are routed to `MultiVehicleManager`. All MAVLink messages are routed to Vehicle's which are associated with the link.

<a id="multivehiclemanager"></a>

## MultiVehicleManager

There is a single `MultiVehicleManager` object within the system. When it receives a HEARTBEAT on a link which has not been previously seen it creates a Vehicle object. `MultiVehicleManager` also keeps tracks of all Vehicles in the system and handles switching from one active vehicle to another and correctly handling a vehicle being removed.

<a id="vehicle"></a>

## Vehicle

The Vehicle object is the main interface through which the QGC code communicates with the physical vehicle.

Note: There is also a UAS object associated with each Vehicle which is a deprecated class and is slowly being phased out with all functionality moving to the Vehicle class. No new code should be added here.

<a id="firmwareplugin-firmwarepluginmanager"></a>

## FirmwarePlugin, FirmwarePluginManager

The FirmwarePlugin class is the base class for firmware plugins. A firmware plugin contains the firmware specific code, such that the Vehicle object is clean with respect to it supporting a single standard interface to the UI.

FirmwarePluginManager is a factory class which creates a FirmwarePlugin instance based on the MAV\_AUTOPILOT/MAV\_TYPE combination for the Vehicle.
