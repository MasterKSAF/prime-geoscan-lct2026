'use client';

import { useState } from 'react';
import type { Vehicle } from '@/lib/planner/schema';
import {
  cameraProfileSchema,
  type CameraProfile,
} from '@/lib/planner/camera-profile';
import { missingCameraFields } from '@/lib/planner/camera-catalog';
import { InfoHint } from './mission-help';

export type CameraPatch = Pick<Vehicle, 'cameraProfiles' | 'cameraIds'>;
const fields = [
  ['sensorWidthMm', 'Матрица: ширина, мм', 100],
  ['sensorHeightMm', 'Матрица: высота, мм', 100],
  ['imageWidthPx', 'Снимок: ширина, пикс.', 100000],
  ['imageHeightPx', 'Снимок: высота, пикс.', 100000],
  ['focalLengthMm', 'Объектив, мм', 1000],
  ['minimumIntervalSec', 'Интервал кадров, с', 60],
  ['shutterSec', 'Выдержка, с', 10],
] as const;

/** Edits a snapshot on this airframe, never the shared catalogue or running plan. */
export function VehicleCameraEditor({
  vehicle,
  disabled = false,
  onSave,
}: {
  vehicle: Vehicle;
  disabled?: boolean;
  onSave: (patch: CameraPatch) => void;
}) {
  const selected = (vehicle.cameraProfiles ?? []).filter((c) =>
    vehicle.cameraIds?.includes(c.id),
  );
  return (
    <details className="fleet-camera-editor">
      <summary>
        Камеры ·{' '}
        {selected.length
          ? selected.map((c) => c.name).join(' / ')
          : 'выберите комплектацию'}{' '}
        <InfoHint label={`Камеры: ${vehicle.id}`}>
          Камера определяет высоту по качеству, ширину прохода и частоту
          снимков. Здесь меняются только параметры этого БВС. Требуемое качество
          и перекрытия задаются в работе. Модельный режим 1 кадр/с и выдержка
          1/1000 с не являются паспортным пределом.
        </InfoHint>
      </summary>
      {selected.map((camera) => (
        <CameraFields
          key={`${vehicle.id}:${JSON.stringify(camera)}`}
          camera={camera}
          vehicleId={vehicle.id}
          disabled={disabled}
          onSave={(next) =>
            onSave({
              cameraIds: vehicle.cameraIds,
              cameraProfiles: vehicle.cameraProfiles?.map((c) =>
                c.id === next.id ? next : c,
              ),
            })
          }
        />
      ))}
      {vehicle.model === 'Custom' &&
        vehicle.jobs
          .filter((t) => ['RGB', 'MS', 'IR'].includes(t))
          .map((type) =>
            selected.some((c) => c.type === type) ? null : (
              <button
                key={type}
                className="mw-button small"
                disabled={disabled}
                onClick={() => {
                  const camera: CameraProfile = {
                    id: `custom-${type.toLowerCase()}`,
                    name: `Камера оператора · ${type}`,
                    type: type as CameraProfile['type'],
                    supportedModels: ['Custom'],
                    status: 'assumed',
                    source: 'Параметры установленной камеры задаёт оператор.',
                  };
                  onSave({
                    cameraIds: [...(vehicle.cameraIds ?? []), camera.id],
                    cameraProfiles: [
                      ...(vehicle.cameraProfiles ?? []).filter(
                        (c) => c.id !== camera.id,
                      ),
                      camera,
                    ],
                  });
                }}
              >
                Задать камеру {type}
              </button>
            ),
          )}
    </details>
  );
}

function CameraFields({
  camera,
  vehicleId,
  disabled,
  onSave,
}: {
  camera: CameraProfile;
  vehicleId: string;
  disabled: boolean;
  onSave: (camera: CameraProfile) => void;
}) {
  const [draft, setDraft] = useState<CameraProfile>(camera);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const missing = missingCameraFields(draft);
  return (
    <section
      className="fleet-camera-fields"
      aria-label={`Камера ${camera.id}: ${vehicleId}`}
    >
      <strong>{camera.name}</strong>
      <small>
        {missing.length
          ? 'Для расчёта заполните пустые параметры.'
          : 'Геометрия для расчёта задана.'}
      </small>
      <div className="fleet-camera-grid">
        {fields.map(([key, label, max]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={key.includes('Px') ? 1 : 0.000001}
              max={max}
              step={key.includes('Px') ? 1 : 'any'}
              disabled={disabled}
              aria-label={`${label}: ${vehicleId}:${camera.id}`}
              placeholder="Укажите"
              value={draft[key] ?? ''}
              onChange={(event) => {
                setDirty(true);
                setError('');
                setDraft({
                  ...draft,
                  [key]:
                    event.target.value === ''
                      ? undefined
                      : event.target.valueAsNumber,
                });
              }}
            />
          </label>
        ))}
      </div>
      <div className="mw-actions">
        <button
          className="mw-button small"
          disabled={disabled || !dirty}
          onClick={() => {
            const parsed = cameraProfileSchema.safeParse({
              ...draft,
              status: 'assumed',
              source: `Параметры оператора: ${camera.source}`.slice(0, 1000),
            });
            if (!parsed.success) {
              setError(
                'Проверьте положительные значения и целое число пикселей.',
              );
              return;
            }
            onSave(parsed.data);
            setDirty(false);
          }}
        >
          Сохранить параметры камеры
        </button>
        <InfoHint label={`Источник камеры ${camera.id}: ${vehicleId}`}>
          {camera.source}
        </InfoHint>
      </div>
      {error && <small role="alert">{error}</small>}
    </section>
  );
}
