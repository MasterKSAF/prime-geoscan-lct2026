---
title: "Generated Vehicle Config Pages | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/vehicle_config_generation.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "5bbf3672f13bcfa6d3ad38f26bd1ff727748f2a83178383a5910e7122053292a"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Generated Vehicle Config Pages | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/views/vehicle_config_generation.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="generated-vehicle-config-pages"></a>

# Generated Vehicle Config Pages

This page explains how the Vehicle Setup pages (Power, Safety, etc.) are generated from JSON definitions and how to extend them.

For the complete JSON schema reference see [tools/generators/config\_qml/README.md](https://docs.qgroundcontrol.com/tools/generators/config_qml/README.html).

<a id="architecture-overview"></a>

## Architecture Overview

The generation pipeline is:

1. **JSON page definitions** in `src/AutoPilotPlugins/{APM,PX4}/VehicleConfig/*.VehicleConfig.json`
2. **Python generator** in `tools/generators/config_qml/page_generator.py`
3. **Generated QML** in `build/src/AutoPilotPlugins/{APM,PX4}/generated/`
4. **C++ component class** (e.g. `APMPowerComponent`) loads the generated QML via `setupSource()`

At build time, CMake runs the generator for each firmware plugin and places generated QML files in the build tree. Those files are compiled into the corresponding `QGroundControl.AutoPilotPlugins.*` QML module.

<a id="where-generation-is-wired"></a>

## Where Generation Is Wired

Generation is configured in each firmware plugin's `CMakeLists.txt`:

- `src/AutoPilotPlugins/APM/CMakeLists.txt` — target `GenerateConfigQmlAPM`
- `src/AutoPilotPlugins/PX4/CMakeLists.txt` — target `GenerateConfigQmlPX4`

Each runs:

bash

```text
python -m tools.generators.config_qml.generate_pages \
    --pages-dir <pages_dir> \
    --output-dir <build_gen_dir>
```

The generator entry point is `tools/generators/config_qml/generate_pages.py`, with most logic in `tools/generators/config_qml/page_generator.py`.

<a id="base-class-vehiclecomponent"></a>

## Base Class: VehicleComponent

`VehicleComponent` (in `src/AutoPilotPlugins/VehicleComponent.h`) provides the C++ side for generated pages. It reads the same JSON file at runtime to:

- Build the **sidebar section list** (including expanded repeat sections)
- **Dynamically filter** disabled repeat instances from the sidebar
- **Connect signals** so the sidebar updates when enable parameters change

Subclasses only need to implement `vehicleConfigJson()` to return the path to the JSON file and `setupSource()` to return the generated QML URL.

<a id="adding-a-new-generated-setup-page"></a>

## Adding a New Generated Setup Page

1. Create a new JSON file in the appropriate `VehicleConfig/` directory:

   ```text
   src/AutoPilotPlugins/APM/VehicleConfig/MyFeature.VehicleConfig.json
   ```

   See [tools/generators/config\_qml/README.md](https://docs.qgroundcontrol.com/tools/generators/config_qml/README.html) for the full JSON schema.
2. Create a minimal C++ component class inheriting `VehicleComponent`:

   - Implement `vehicleConfigJson()` to return the JSON path
   - Implement `setupSource()` to return the generated QML URL
3. Register the component in the firmware plugin's `AutoPilotPlugin` subclass.
4. Add the generated QML filename to `_config_generated_qml_names` in the plugin's `CMakeLists.txt`.
5. Build. CMake will regenerate the QML automatically:

   bash

   ```text
   cmake --build build --config Debug --target GenerateConfigQmlAPM  # or GenerateConfigQmlPX4
   ```

<a id="important-notes"></a>

## Important Notes

- The `constants`, `params`, and `bindings` sections should appear **before** `sections` in the JSON file for readability, since sections reference them.
- Constants should use native JSON numbers, not strings (e.g. `0` not `"0"`).
- The `_config_generated_qml_names` list in CMake is explicit. If you forget to add a new page output file, integration will be incomplete.
- Inside repeat sections, use parameter **postfixes** in `param` fields and `_fullParamName()` in `showWhen` expressions.
- The `enableParam`/`disabledParamValue` pair is required together — you cannot specify one without the other.
