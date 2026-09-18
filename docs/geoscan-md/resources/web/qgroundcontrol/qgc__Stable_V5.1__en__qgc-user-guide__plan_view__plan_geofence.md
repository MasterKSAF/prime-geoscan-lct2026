---
title: "Plan View - GeoFence | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_geofence.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "21a68c2c620156a76b6b76ce36adf6f61c666e5e1cec48efefae609c67635f44"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Plan View - GeoFence | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_geofence.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="plan-view-geofence"></a>

# Plan View - GeoFence

GeoFences allow you to create virtual regions within which the vehicle can fly, or in which it is *not allowed* to fly. You can also configure the action taken if you fly outside permitted areas.

INFO

*QGroundControl* will not display the GeoFence options if they are not supported by the connected vehicle firmware.

<a id="create-a-geofence"></a>

## Create a GeoFence

To create a GeoFence:

1. Navigate to the Plan View
2. Select the **GeoFence** layer using the [Layer Switcher](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html#layer_switcher) in the top-right area of the map (or expand the **GeoFence** section in the [Plan Editor Panel](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html#plan_editor_panel))
3. Insert a circular or polygon region by pressing the **Circular Fence** or **Polygon Fence** button in the GeoFence section. A new region will be added to the map and to the associated list of fences below the buttons.

TIP

You can create multiple regions by pressing the buttons multiple times, allowing complex geofence definitions to be created.

- Circular region:

  - Move the region by dragging the central dot on the map
  - Resize the circle by dragging the dot on the edge of the circle (or you can change the radius value in the fence panel).
- Polygon region:

  - Move the vertices by dragging the filled dots
  - Create new vertices by clicking the "unfilled" dots on the lines between the filled vertices.

1. By default new regions are created as *inclusion* zones (vehicles must stay within the region). Change them to exclusion zones (where the vehicle can't travel) by unchecking the associated *Inclusion* checkbox in the fence panel.

Depending on the firmware, the GeoFence section may also show fence parameters (e.g. breach action) and a **Breach Return Point** that the vehicle will fly to if it breaches the fence.

<a id="edit-delete-a-geofence"></a>

## Edit/Delete a GeoFence

You can select a GeoFence region to edit by selecting its *Edit* radio button in the GeoFence section. You can then edit the region on the map as described in the previous section.

Regions can be deleted by pressing the associated **Del** button.

<a id="upload-a-geofence"></a>

## Upload a GeoFence

The GeoFence is uploaded along with the rest of the plan using the **Upload** button in the [Plan Toolbar](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/plan_view/plan_view.html#file).
