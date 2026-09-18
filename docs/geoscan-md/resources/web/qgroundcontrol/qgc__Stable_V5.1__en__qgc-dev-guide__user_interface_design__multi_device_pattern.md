---
title: "Multi-Device Design Pattern | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/user_interface_design/multi_device_pattern.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "486bb437d26ebffc6ff156693dc189aa211f0b1a8e47e76e97c679ffeb9c484f"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Multi-Device Design Pattern | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/user_interface_design/multi_device_pattern.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="multi-device-design-pattern"></a>

# Multi-Device Design Pattern

QGroundControl is designed to run on multiple device types from desktop to laptop to tablet to small phone sized screens using mouse and touch. Below is the description of how QGC does it and the reasoning behind it.

<a id="efficient-1-person-dev-team"></a>

## Efficient 1 person dev team

The design pattern that QGC development uses to solve this problem is based around making new feature development quick and allowing the code base to be testable and maintained by a very small team (let's say 1 developer as the default dev team size). The pattern to achieve this is followed very strictly, because not following it will lead to slower dev times and lower quality.

Supporting this 1 person dev team concept leads to some tough decisions which not everyone may be happy about. But it does lead to QGC being released on many OS and form factors using a single codebase. This is something most other ground stations out there are not capable of achieving.

What about contributors you ask? QGC has a decent amount of contributors. Can't they help move things past this 1 person dev team concept? Yes QGC has quite a few contributors. But unfortunately they come and go over time. And when they go, the code they contributed still must be maintained. Hence you fall back to the 1 person dev team concept which is mostly what has been around as an average over the last three years of development.

<a id="target-device"></a>

## Target Device

The priority target for QGC UI design is a tablet, both from a touch standpoint and a screen size standpoint (think 10" Samsung Galaxy tab). Other device types and sizes may see some sacrifices of visuals and/or usability due to this decision. The current order when making priority based decisions is Tablet, Laptop, Desktop, Phone (any small screen).

<a id="phone-sized-screen-support"></a>

### Phone sized screen support

As specified above, at this point smaller phone sized screens are the lowest level priority for QGC. More focus is put onto making active flight level displays, such as the Fly view, more usable. Less focus is placed on Setup related views such as Setup and Plan. Those specific views are tested to be functionally usable on small screens but they may be painful to use.

<a id="development-tools-used"></a>

## Development tools used

<a id="qt-layout-controls"></a>

### Qt Layout controls

QGC does not have differently coded UIs which are targeted to different screen sizes and/or form factors. In general it uses QML Layout capabilities to reflow a single set of QML UI code to fit different form factors. In some cases it provides less detail on small screen sizes to make things fit. But that is a simple visibility pattern.

<a id="factsystem"></a>

### FactSystem

Internal to QGC is a system which is used to manage all of the individual pieces of data within the system. This data model is then connected to controls.

<a id="heavy-reliance-on-reusable-controls"></a>

### Heavy reliance on reusable controls

QGC UI is developed from a base set of reusable controls and UI elements. This way any new feature added to a reusable control is now available throughout the UI. These reusable controls also connect to FactSystem Facts which then automatically provides appropriate UI.

<a id="cons-for-this-design-pattern"></a>

## Cons for this design pattern

- The QGC user interface ends up being a hybrid style of desktop/laptop/tablet/phone. Hence not necessarily looking or feeling like it is optimized to any of these.
- Given the target device priority list and the fact that QGC tends to just re-layout the same UI elements to fit different form factors you will find this hybrid approach gets worse as you get farther away from the priority target. Hence small phone sized screens taking the worst hit on usability.
- The QGC reusable control set may not provide the absolute best UI in some cases. But it is still used to prevent the creation of additional maintenance surface area.
- Since the QGC UI uses the same UI code for all OSes, QGC does not follow the UI design guidelines specified by the OS itself. It has it's own visual style which is somewhat of a hybrid of things picked from each OS. Hence the UI looks and works mostly the same on all OS. Once again this means for example that QGC running on Android won't necessarily look like an android app. Or QGC running on an iPhone will not look or work like most other iPhone apps. That said the QGC visual/functional style should be understandable to these OS users.

<a id="pros-for-this-design-pattern"></a>

## Pros for this design pattern

- It takes less time to design a new feature since the UI coding is done once using this hybrid model and control set. Layout reflow is quite capable in Qt QML and becomes second nature once you get used to it.
- A piece of UI can be functionally tested on one platform since the functional code is the same across all form factors. Only layout flow must be visually checked on multiple devices but this is fairly easily done using the mobile simulators. In most cases this is what is needed:

  - Use desktop build, resizing windows to test reflow. This will generally cover a tablet sized screen as well.
  - Use a mobile simulator to visually verify a phone sized screen. On OSX XCode iPhone simulator works really well.
- All of the above are critical to keeping our hypothetical 1 person dev team efficient and to keep quality high.

<a id="future-directions"></a>

## Future directions

- Raise phone (small screen) level prioritization to be more equal to Tablet. Current thinking is that this won't happen until a 3.3 release time frame (release after current one being worked on).
