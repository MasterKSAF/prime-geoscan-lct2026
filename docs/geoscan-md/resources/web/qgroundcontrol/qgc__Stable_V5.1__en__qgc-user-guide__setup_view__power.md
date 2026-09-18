---
title: "Power Setup | QGC Guide (Stable_V5.1)"
source_url: "https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/power.html"
retrieved_at: "2026-09-15T18:07:50.845826+00:00"
source_sha256: "3c7177c7a91323e69c98ab01736b3b703ec1f05301771fae8088113efddb25ec"
license: "CC BY 4.0"
language: "en"
transformation: "HTML body to Markdown; navigation omitted; image source links retained"
review_status: "downloaded-and-converted-not-proof-of-reading"
---

Источник: [Power Setup | QGC Guide (Stable_V5.1)](https://docs.qgroundcontrol.com/Stable_V5.1/en/qgc-user-guide/setup_view/power.html). Авторы: QGroundControl contributors. Лицензия: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

> Снимок документации, не результат испытания программы. Текст оставлен на языке источника; изображения заменены ссылками. Факт прочтения фиксируется отдельно в реестре исследования.

<a id="power-setup"></a>

# Power Setup

The *Power Setup* screen is used to configure battery parameters and calibrate ESCs.

<a id="battery-voltage-current-calibration"></a>

## Battery Voltage/Current Calibration

Enter data for your battery/power module from its data sheet: number of cells, full voltage per cell, empty voltage per cell. If provided, also enter voltage divider and amps-per-volt information.

*QGroundControl* can be used to calculate appropriate voltage divider and amps-per-volt values from measurements:

1. Measure the voltage from the battery using a multimeter.
2. Click **Calculate** next to the *Voltage divider* field. On the prompt that appears:
3. Enter the measured voltage.
4. Click **Calculate** to generate a new voltage-divider value.
5. Click **Close** to save the value into the main form.
6. Measure the current from the battery.
7. Click **Calculate** next to the *Amps per volt* field. On the prompt that appears:
8. Enter the measured current.
9. Click **Calculate** to generate a new *amps per volt* value.
10. Click **Close** to save the value into the main form.

<a id="advanced-power-settings"></a>

## Advanced Power Settings

Click the **Show Advanced Settings** checkbox to specify advanced power settings.

<a id="voltage-drop-on-full-load"></a>

### Voltage Drop on Full Load

Batteries show less voltage at high throttle. Enter the difference in Volts between idle throttle and full throttle, divided by the number of battery cells. The default value should be used if unsure!

WARNING

If the value is too high the battery may be deep-discharged and damaged.

<a id="esc-pwm-minimum-and-maximum-calibration"></a>

## ESC PWM Minimum and Maximum Calibration

To calibrate the ESC max/min PWM values:

1. Remove the propellers.
2. Connect the vehicle to QGC via USB (only).
3. Click the **Calibrate** button.

WARNING

Never attempt ESC calibration with props on.

Motors should not spin during ESC calibration. However if an ESC doesn't properly support/detect the calibration sequence then it will respond to the PWM input by running the motor at maximum speed.
