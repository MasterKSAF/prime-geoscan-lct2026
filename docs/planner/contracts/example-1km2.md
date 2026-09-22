# Задача: Учебная съёмка · 1 км²

> Модельное планирование. Этот документ не является разрешением или командой на полёт.

- ID: demo-1km2
- Версия схемы: 2.0
- Окно: 2026-09-24T10:00:00+03:00 — 2026-09-24T18:00:00+03:00 (Europe/Moscow)
- Работ: 1; типы: RGB
- Критерий: раньше завершить работы
- Доступных БВС: 2 из 2
- Резерв: 25%
- Батарея каждого БВС: текущий заряд; повторные вылеты на остатке, без прогнозируемой замены.
- Дополнительных ограничений: 0; постоянных запретов: 0
- Разнесение: 30 м по горизонтали, 15 м по вертикали. Источник: Учебные допуски, не подтверждённая норма жюри.
- Рельеф: учебная плоскость; Синтетическая горизонтальная поверхность; не реальный DEM участка.
- Ветер: 2 м/с, от 270°. Постоянный ручной вектор на всё окно.

## Работы

- RGB · вся территория: RGB, 100 м, полоса 117.5 м. Назначение: автоматическое. Освещение: топографическая съёмка, ясное небо, Солнце ≥15°. Параметры приняты для примера: PF1B: 23,5×15,6 мм, 6000×4000, 20 мм по буклету Gemini. Перекрытия, выдержка и период — учебные параметры.

## Примечание оператора

Учебный сценарий. Координаты реальные; область, базы, допуски, ресурсы и плоская поверхность синтетические. 100 км² — нагрузочный вход: выполнимость и время расчёта не гарантируются.

## БВС и источники параметров

- Gemini · 01 (Gemini): доступен; источник: https://download.geoscan.ru/site-files/gemini/Gemini\_Specs\_EN\_RUS.pdf?v2. 28 мин — расчётный бюджет учебной конфигурации, не измеренная выносливость.; Скорость, развороты, набор/снижение и частота кадров требуют калибровки.
- Gemini · 02 (Gemini): доступен; источник: https://download.geoscan.ru/site-files/gemini/Gemini\_Specs\_EN\_RUS.pdf?v2. 28 мин — расчётный бюджет учебной конфигурации, не измеренная выносливость.; Скорость, развороты, набор/снижение и частота кадров требуют калибровки.

## Полный состав задания

Для обратного импорта используйте отдельный файл .mission.json или .mission.yaml. Правка этого пересказа не меняет расчёт.

```json
{
  "batteries": [
    {
      "commissionedAt": null,
      "cycles": null,
      "id": "gemini-1-battery-1",
      "initialPct": 100,
      "name": "Gemini · 01 · АКБ 1",
      "readyAt": "2026-09-24T10:00:00+03:00",
      "rechargeSec": null,
      "source": "Учебный запас заряженных АКБ; наличие у реального оператора не подтверждено.",
      "vehicleId": "gemini-1"
    },
    {
      "commissionedAt": null,
      "cycles": null,
      "id": "gemini-2-battery-1",
      "initialPct": 100,
      "name": "Gemini · 02 · АКБ 1",
      "readyAt": "2026-09-24T10:00:00+03:00",
      "rechargeSec": null,
      "source": "Учебный запас заряженных АКБ; наличие у реального оператора не подтверждено.",
      "vehicleId": "gemini-2"
    }
  ],
  "flightEnvelope": {
    "maxAltitudeM": 500,
    "minSurveyAltitudeM": 10,
    "source": "Учебный диапазон сценария, не разрешение воздушного пространства."
  },
  "id": "demo-1km2",
  "jobs": [
    {
      "area": {
        "coordinates": [
          [
            [
              30.3,
              60.035
            ],
            [
              30.318005461304388,
              60.035
            ],
            [
              30.318005461304388,
              60.04399320363724
            ],
            [
              30.3,
              60.04399320363724
            ],
            [
              30.3,
              60.035
            ]
          ]
        ],
        "type": "Polygon"
      },
      "assignedVehicleIds": [],
      "daylight": "topographicClearSky",
      "id": "rgb-01",
      "job": {
        "altitudeM": 100,
        "autoBearing": true,
        "bearingDeg": 0,
        "qualitySource": "Учебный RGB-профиль PF1B: 23,5 мм / 20 мм на 100 м; перекрытие 60% и шаг 15,6 м — параметры сценария. Скорость затвора не подтверждена.",
        "sideOverlap": 0.6,
        "swathM": 117.5,
        "triggerDistanceM": 15.6,
        "type": "RGB"
      },
      "name": "RGB · вся территория",
      "quality": {
        "focalLengthMm": 20,
        "forwardOverlap": 0.7,
        "imageHeightPx": 4000,
        "imageWidthPx": 6000,
        "maximumBlurPx": 1,
        "maximumGsdCm": 3,
        "minimumIntervalSec": 1,
        "mode": "camera",
        "sensorHeightMm": 15.6,
        "sensorWidthMm": 23.5,
        "shutterSec": 0.001,
        "source": "PF1B: 23,5×15,6 мм, 6000×4000, 20 мм по буклету Gemini. Перекрытия, выдержка и период — учебные параметры.",
        "status": "assumed"
      }
    }
  ],
  "name": "Учебная съёмка · 1 км²",
  "notes": "Учебный сценарий. Координаты реальные; область, базы, допуски, ресурсы и плоская поверхность синтетические. 100 км² — нагрузочный вход: выполнимость и время расчёта не гарантируются.",
  "planning": {
    "altitudePreference": "balanced",
    "batteryPolicy": "installed-current-v1",
    "maxComputeMs": 6000,
    "maxSortiesPerVehicle": 8,
    "preparationSec": 120,
    "safetyPolicy": "continuous-occupancy-v1",
    "separationHorizontalM": 30,
    "separationSource": "Учебные допуски, не подтверждённая норма жюри.",
    "separationVerticalM": 15,
    "serviceSec": 180,
    "temporalBufferSec": 5,
    "windModel": "constantGroundSpeed"
  },
  "restrictions": [],
  "scenario": {
    "airspace": {
      "coordinates": [
        [
          [
            30.292797815478245,
            60.031402718545095
          ],
          [
            30.325207645826143,
            60.031402718545095
          ],
          [
            30.325207645826143,
            60.04759048509214
          ],
          [
            30.292797815478245,
            60.04759048509214
          ],
          [
            30.292797815478245,
            60.031402718545095
          ]
        ]
      ],
      "type": "Polygon"
    },
    "area": {
      "coordinates": [
        [
          [
            30.3,
            60.035
          ],
          [
            30.318005461304388,
            60.035
          ],
          [
            30.318005461304388,
            60.04399320363724
          ],
          [
            30.3,
            60.04399320363724
          ],
          [
            30.3,
            60.035
          ]
        ]
      ],
      "type": "Polygon"
    },
    "clearanceM": 15,
    "exclusions": [],
    "job": {
      "altitudeM": 100,
      "autoBearing": true,
      "bearingDeg": 0,
      "qualitySource": "Учебный RGB-профиль PF1B: 23,5 мм / 20 мм на 100 м; перекрытие 60% и шаг 15,6 м — параметры сценария. Скорость затвора не подтверждена.",
      "sideOverlap": 0.6,
      "swathM": 117.5,
      "triggerDistanceM": 15.6,
      "type": "RGB"
    },
    "name": "Учебная съёмка · 1 км²",
    "objective": "makespan",
    "reservePct": 25,
    "reserveSites": [
      [
        30.304501365326097,
        60.033920815563526
      ],
      [
        30.313504095978292,
        60.033920815563526
      ]
    ],
    "schemaVersion": "1.0",
    "terrain": "unknown",
    "vehicles": [
      {
        "airspeedMps": 9,
        "assumptions": [
          "28 мин — расчётный бюджет учебной конфигурации, не измеренная выносливость.",
          "Скорость, развороты, набор/снижение и частота кадров требуют калибровки."
        ],
        "batteryPct": 100,
        "climbMps": 3,
        "descentMps": 1,
        "effectiveEnduranceMin": 28,
        "enabled": true,
        "id": "gemini-1",
        "jobs": [
          "RGB",
          "MS"
        ],
        "kind": "multirotor",
        "landing": [
          30.304501365326097,
          60.033920815563526
        ],
        "maxWindMps": 10,
        "model": "Gemini",
        "name": "Gemini · 01",
        "source": "https://download.geoscan.ru/site-files/gemini/Gemini_Specs_EN_RUS.pdf?v2",
        "start": [
          30.304501365326097,
          60.033920815563526
        ],
        "turnSeconds": 4
      },
      {
        "airspeedMps": 9,
        "assumptions": [
          "28 мин — расчётный бюджет учебной конфигурации, не измеренная выносливость.",
          "Скорость, развороты, набор/снижение и частота кадров требуют калибровки."
        ],
        "batteryPct": 100,
        "climbMps": 3,
        "descentMps": 1,
        "effectiveEnduranceMin": 28,
        "enabled": true,
        "id": "gemini-2",
        "jobs": [
          "RGB",
          "MS"
        ],
        "kind": "multirotor",
        "landing": [
          30.313504095978292,
          60.033920815563526
        ],
        "maxWindMps": 10,
        "model": "Gemini",
        "name": "Gemini · 02",
        "source": "https://download.geoscan.ru/site-files/gemini/Gemini_Specs_EN_RUS.pdf?v2",
        "start": [
          30.313504095978292,
          60.033920815563526
        ],
        "turnSeconds": 4
      }
    ],
    "wind": {
      "fromDeg": 270,
      "speedMps": 2
    }
  },
  "schemaVersion": "2.0",
  "terrainModel": {
    "elevationM": 0,
    "kind": "flat",
    "source": "Синтетическая горизонтальная поверхность; не реальный DEM участка."
  },
  "window": {
    "end": "2026-09-24T18:00:00+03:00",
    "start": "2026-09-24T10:00:00+03:00",
    "timezone": "Europe/Moscow"
  }
}
```
