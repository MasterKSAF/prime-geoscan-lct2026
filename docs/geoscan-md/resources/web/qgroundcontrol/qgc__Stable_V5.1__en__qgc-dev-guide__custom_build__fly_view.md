---
title: "Fly View Customization | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/fly_view.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "0c3c9a0e53b3490f06c3308e51347375476751148d56f496254a7bf19b501072"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Fly View Customization | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/fly_view.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="fly-view-customization"></a>

# Fly View Customization

The Fly View is designed in such a way that it can be cusomtized in multiple ways from simple to more complex. It is designed in three separate layers each of which are customizable providing different levels of change.

<a id="layers"></a>

## Layers

- There are three layers to the fly view from top to bottom visually:

  - [`FlyView.qml`](https://github.com/mavlink/qgroundcontrol/blob/master/src/FlyView/FlyView.qml) This is the base layer of ui and business logic to control map and video switching.
  - [`FlyViewWidgetsOverlay.qml`](https://github.com/mavlink/qgroundcontrol/blob/master/src/FlyView/FlyViewWidgetLayer.qml) This layer includes all the remaining widgets for the fly view.
  - [`FlyViewCustomLayer.qml`](https://github.com/mavlink/qgroundcontrol/blob/master/src/FlyView/FlyViewCustomLayer.qml) This is a layer you override using resource override to add your own custom layer.

<a id="inset-negotiation-using-qgctoolinsets"></a>

### Inset Negotiation using `QGCToolInsets`

An important aspect of the Fly View is that it needs to understand how much central space it has in the middle of it's map window which is not obstructed by ui widgets which are at the edges of the window. It uses this information to pan the map when the vehicle goes out of view. This need to be done not only for the window edges but also for the widgets themselve such that the map pans before it goes under a widget.

This is done through the use of the [`QGCToolInsets`](https://github.com/mavlink/qgroundcontrol/blob/master/src/QmlControls/QGCToolInsets.qml) object included in each layer. This objects provides inset information for each window edge informing the system as to how much real estate is taken up by edge based ui. Each layer is given the insets of the layer below it through `parentToolInsets` and then reports back the new insets taking into account the layer below and it's own additions through `toolInsets`. The final results total inset is then given to the map so it can do the right thing. The best way to understand this is to look at both the upstream and custom example code.

<a id="flyview-qml"></a>

### `FlyView.qml`

The base layer for the view is also the most complex from ui interactions and business logic. It includes the main display elements of map and video as well as the guided controls. Although you can resource override this layer it is not recommended. And if you do you better really (really) know what you are doing. The reason it is a separate layer is to make the layer above much simpler and easier to customize.

<a id="flyviewwidgetsoverlay-qml"></a>

### `FlyViewWidgetsOverlay.qml`

This layer contains all the remaining controls of the fly view. You have the ability to hide the controls through use of [`QGCFlyViewOptions`](https://github.com/mavlink/qgroundcontrol/blob/master/src/API/QGCOptions.h). But in order to change the layout of the upstream controls you must use a resource override. If you look at the source you'll see that the controls themselves are well encapsulated such that it should not be that difficult to create your own override which repositions them and/or adds your own ui. While maintaining a connection to the upstream implementaions of the controls.

<a id="flyviewcustomlayer-qml"></a>

### `FlyViewCustomLayer.qml`

This provides the simplest customization ability to the Fly View. Allowing you the add ui elements which are additive to the existing upstream controls. The upstream code adds no ui elements and is meant to be the basis for your own custom code used as a resource override for this qml. The custom example code provides you with an example of how to do it.

<a id="recommendations"></a>

## Recommendations

<a id="simple-customization"></a>

### Simple customization

The best place to start is using a custom layer override plus turning off ui elements from the widgets layer (if needed). I would recommend trying to stick with only this if at all possible. It provides the greatest abilty to not get screwed by upstream changes in the layers below.

<a id="moderate-complexity-customization"></a>

### Moderate complexity customization

If you really need to reposition upstream ui elements then your only choice is overriding `FlyViewWidgetsOverlay.qml`. By doing this you are distancing yourself a bit from upstream changes. Although you will still get changes in the upstream controls for free. If there is a whole new control added to the fly view upstream you won't get it until you add it to your own override.

<a id="highly-complex-customization"></a>

### Highly complex customization

The last and least recommended customization mechanism is overriding `FlyView.qml`. By doing this you are distancing yourself even further from getting upstream changes for free.
