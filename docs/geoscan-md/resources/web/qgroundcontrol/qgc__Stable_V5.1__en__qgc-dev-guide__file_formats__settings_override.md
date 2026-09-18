---
title: "Settings Override Files | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/file_formats/settings_override.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "5e152d0ca43092667946e60fb8aafdd21347e33c9d49adce8e32aeda64395ab8"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Settings Override Files | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/file_formats/settings_override.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="settings-override-files"></a>

# Settings Override Files

Settings override files let you change the metadata and values of *QGroundControl* application settings without creating a custom build. You can use them to:

- Change the default value for a setting
- Force a setting to a specific value and hide it from the user
- Hide individual settings from the Settings UI
- Adjust setting metadata such as min/max ranges, decimal places, descriptions, and enum/bitmask choices

Override files are loaded once at application startup.

<a id="file-location"></a>

## File Location

*QGroundControl* scans the `Settings` subdirectory of the [Application Load/Save Path](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/settings_view/general.html) (for example `~/Documents/QGroundControl/Settings`) for files with a `.settings` extension. Every matching file is loaded in case-insensitive alphabetical order by filename. If multiple files override the same setting, the last one loaded (alphabetically latest) wins.

<a id="file-format"></a>

## File Format

A settings override file is a JSON file with the following structure:

json

```text
{
    "version": 1,
    "fileType": "Settings",
    "groups": {
        "groupName": {
            "settingName": {
                "overrideKey": "overrideValue"
            }
        }
    }
}
```

- `version` — Must be `1`.
- `fileType` — Must be `"Settings"`.
- `groups` — An object keyed by settings group name. Each group contains one object per setting to override, keyed by setting name.

<a id="group-and-setting-names"></a>

### Group and Setting Names

The group name is the `settingsGroup` value used by the corresponding `SettingsGroup` subclass in the source code (the group used for `QSettings` storage). Examples: `FlyView`, `PlanView`, `Video`, `AutoConnect`, `RTK`, `Units`. Note that top-level application settings (`AppSettings`) and MAVLink settings (`MavlinkSettings`) use an empty group name: `""`.

Setting names are the fact names defined in the `*.SettingsGroup.json` metadata files found in [src/Settings](https://github.com/mavlink/qgroundcontrol/tree/master/src/Settings). For example `FlyView.SettingsGroup.json` contains the setting names available in the `FlyView` group.

<a id="supported-override-keys"></a>

### Supported Override Keys

| Key | Description |
| --- | --- |
| `forceRawValue` | Forces the setting to the specified value and hides it from the Settings UI. May not be combined with `visible`. |
| `visible` | Set to `false` to hide the setting from the Settings UI. May not be combined with `forceRawValue`. |
| `default` | Changes the default value for the setting. Unlike `forceRawValue` the user can still change the value. |
| `min` | Changes the minimum allowed value. |
| `max` | Changes the maximum allowed value. |
| `decimalPlaces` | Changes the number of decimal places shown. |
| `shortDesc` | Changes the short description (label). |
| `longDesc` | Changes the long description (tooltip). |
| `enumValues` / `enumStrings` | Replaces the enum choices for the setting. |
| `bitmask` | Replaces the bitmask choices for the setting. |

These are the same key names used by the Fact metadata JSON format ([src/Settings/\*.SettingsGroup.json](https://github.com/mavlink/qgroundcontrol/tree/master/src/Settings)). Keys other than those listed above are not supported — specifying an unknown key causes the entire override for that setting to be ignored, with a warning in the console log. The same applies to combining `forceRawValue` and `visible` in the same override. The `name` and `type` keys must not be specified — they are taken from the existing setting.

Override values are converted to the setting's underlying Fact type as declared in its `*.SettingsGroup.json` metadata (for example a number for `uint32`/`double` settings, `true`/`false` for `bool` settings). For enum settings, `forceRawValue` and `default` take the raw enum value — an entry from the setting's `enumValues` list — not the index or display string.

<a id="enum-and-bitmask-overrides"></a>

### Enum and Bitmask Overrides

Enum and bitmask overrides replace the full choice list — partial overrides (for example renaming a single entry) are not supported. The formats are the same as the Fact metadata JSON:

- `enumStrings` / `enumValues` — A pair of comma-separated strings which must be specified together and contain the same number of entries. `enumStrings` holds the display labels, `enumValues` the corresponding raw values:

  json

  ```text
  "someEnumSetting": {
      "enumStrings": "Low,Medium,High",
      "enumValues": "0,1,2"
  }
  ```
- `bitmask` — An array of objects, each with a `description` (display label) and an `index` (bit index, not the mask value — bit index `n` corresponds to raw value `1 << n`):

  json

  ```text
  "someBitmaskSetting": {
      "bitmask": [
          { "description": "Option A", "index": 0 },
          { "description": "Option B", "index": 1 }
      ]
  }
  ```

<a id="example"></a>

## Example

The following file forces the video decoder setting to a specific value and hides it, hides the virtual joystick setting (which lives in the top-level application group `""`), and changes the default guided minimum altitude:

json

```text
{
    "version": 1,
    "fileType": "Settings",
    "groups": {
        "Video": {
            "forceVideoDecoder": {
                "forceRawValue": 0
            }
        },
        "": {
            "virtualJoystick": {
                "visible": false
            }
        },
        "FlyView": {
            "guidedMinimumAltitude": {
                "default": 5
            }
        }
    }
}
```

<a id="debugging"></a>

## Debugging

Enable the `Utilities.SettingsManager` logging category ([Console Logging](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/troubleshooting/console_logging.html)) to see which override files are loaded and which overrides are applied at startup.

<a id="related-mechanisms"></a>

## Related Mechanisms

Custom builds can achieve the same result in code by overriding `QGCCorePlugin::adjustSettingMetaData` — see [Custom Build Plugins](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-dev-guide/custom_build/plugins.html). Settings file overrides are applied first, then the core plugin gets a chance to adjust the metadata.
