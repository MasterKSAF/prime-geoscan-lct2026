'use client';
import { useState } from 'react';
import type { Coordinate } from '@/lib/planner/schema';
import type { MissionDocument } from '@/lib/planner/mission-schema';
import {
  baseVehicleIds,
  deleteMissionBase,
  missionBases,
  reassignBaseVehicles,
  updateMissionBase,
  type BaseEdit,
} from '@/lib/planner/mission-bases';
import { InfoHint } from './mission-help';
import { vehicleDisplayName } from '@/lib/planner/mission-vehicle-label';

export type BaseAction = {
  id: string;
  action: 'delete' | 'vehicles';
  key: number;
};

export default function MissionBaseEditor(p: {
  document: MissionDocument;
  draft: BaseEdit;
  busy: boolean;
  action?: BaseAction | null;
  onDraft: (draft: BaseEdit) => void;
  onMove: () => void;
  onClose: () => void;
  onApply: (d: MissionDocument) => Promise<void>;
  onError: (message: string) => void;
}) {
  const { document: d, draft } = p;
  const bases = missionBases(d),
    old = bases.find((b) => b.id === draft.id);
  const linked = old ? baseVehicleIds(d, old) : [];
  const removed = linked.filter((id) => !draft.vehicleIds.includes(id));
  const [assigning, setAssigning] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [replacement, setReplacement] = useState(''),
    [handled, setHandled] = useState<number | null>(null);
  if (p.action?.id === draft.id && p.action.key !== handled) {
    setHandled(p.action.key);
    setDeleting(p.action.action === 'delete');
    setAssigning(p.action.action === 'vehicles');
  }
  const changed =
    !old ||
    old.name !== draft.name ||
    JSON.stringify(old.coordinate) !== JSON.stringify(draft.coordinate) ||
    JSON.stringify([...linked].sort()) !==
      JSON.stringify([...draft.vehicleIds].sort());
  const apply = (remove = false) => {
    try {
      let next = d;
      if (remove)
        next = deleteMissionBase(d, draft.id, replacement || undefined);
      else {
        if (removed.length)
          next = reassignBaseVehicles(d, draft.id, replacement, removed);
        next = updateMissionBase(next, draft);
      }
      void p.onApply(next);
    } catch (e) {
      p.onError(e instanceof Error ? e.message : String(e));
    }
  };
  const destination = (
    <label className="mw-field">
      Перевести БВС на
      <select
        aria-label="База для переназначения"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
      >
        <option value="">Выберите другую базу</option>
        {bases
          .filter((b) => b.id !== draft.id)
          .map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
      </select>
    </label>
  );
  return (
    <fieldset
      className="map-object-form base-editor"
      disabled={p.busy}
      aria-label="Выбранная база"
    >
      <div className="base-editor-heading">
        <label className="mw-field">
          База
          <input
            aria-label="Название базы"
            maxLength={100}
            value={draft.name}
            onChange={(e) => p.onDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <button
          className="mw-button small"
          aria-label="Закрыть настройки базы"
          onClick={p.onClose}
        >
          ×
        </button>
      </div>
      <div className="base-editor-vehicles">
        <strong>
          {draft.vehicleIds.length
            ? `БВС на базе: ${draft.vehicleIds.length}`
            : 'Пустая база'}
        </strong>
        <button
          className="mw-button small"
          aria-expanded={assigning}
          onClick={() => {
            setAssigning(!assigning);
            setDeleting(false);
          }}
        >
          Изменить БВС
        </button>
      </div>
      {!!draft.vehicleIds.length && (
        <div className="base-vehicle-chips">
          {d.scenario.vehicles
            .filter((v) => draft.vehicleIds.includes(v.id))
            .map((v) => (
              <span key={v.id}>{vehicleDisplayName(v)}</span>
            ))}
        </div>
      )}
      <div className="mw-actions">
        <button className="mw-button small" onClick={p.onMove}>
          {old ? 'Перенести на карте' : 'Указать на карте'}
        </button>
        {old && (
          <button
            className="mw-button small mw-action-remove"
            aria-expanded={deleting}
            onClick={() => {
              setDeleting(!deleting);
              setAssigning(false);
            }}
          >
            Удалить базу
          </button>
        )}
        <InfoHint label="Перенос базы">
          Перетащите значок базы мышью или нажмите «Перенести на карте» и
          укажите новое место. Связанные БВС переместятся вместе с базой. После
          переноса пересчитайте план.
        </InfoHint>
      </div>
      {assigning && (
        <section className="base-editor-section" aria-label="Назначение БВС">
          <div className="map-object-list">
            {d.scenario.vehicles.map((v) => (
              <label className="mw-checkbox" key={v.id}>
                <input
                  type="checkbox"
                  checked={draft.vehicleIds.includes(v.id)}
                  onChange={(e) =>
                    p.onDraft({
                      ...draft,
                      vehicleIds: e.target.checked
                        ? [...draft.vehicleIds, v.id]
                        : draft.vehicleIds.filter((id) => id !== v.id),
                    })
                  }
                />
                {vehicleDisplayName(v)}
              </label>
            ))}
          </div>
          <label className="mw-field">
            Новые БВС используют базу
            <select
              aria-label="Назначение базы"
              value={draft.purpose}
              onChange={(e) =>
                p.onDraft({
                  ...draft,
                  purpose: e.target.value as BaseEdit['purpose'],
                })
              }
            >
              <option value="both">Для старта и возвращения</option>
              <option value="start">Только для старта</option>
              <option value="landing">Только для посадки</option>
            </select>
          </label>
          {!!removed.length && destination}
        </section>
      )}
      {deleting && (
        <section className="base-editor-delete" aria-label="Удаление базы">
          <p>
            {linked.length
              ? `${linked.length} БВС нужно перевести на другую базу.`
              : `Удалить пустую базу «${old?.name}»?`}
          </p>
          {!!linked.length && destination}
          <div className="mw-actions">
            <button
              className="mw-button small mw-action-remove"
              disabled={!!linked.length && !replacement}
              onClick={() => apply(true)}
            >
              Подтвердить удаление
            </button>
            <button
              className="mw-button small"
              onClick={() => setDeleting(false)}
            >
              Отмена
            </button>
          </div>
        </section>
      )}
      <details className="base-editor-coordinates">
        <summary>Точные координаты</summary>
        {(['Долгота базы', 'Широта базы'] as const).map((label, index) => (
          <label className="mw-field" key={label}>
            {index === 0 ? 'Долгота' : 'Широта'}
            <input
              aria-label={label}
              type="number"
              step="0.000001"
              value={draft.coordinate[index]}
              onChange={(e) => {
                const point: Coordinate = [...draft.coordinate];
                point[index] = e.target.valueAsNumber;
                p.onDraft({ ...draft, coordinate: point });
              }}
            />
          </label>
        ))}
      </details>
      {changed && !deleting && (
        <div className="mw-actions">
          <button
            className="mw-button primary small"
            disabled={!!removed.length && !replacement}
            onClick={() => apply()}
          >
            {old ? 'Сохранить изменения' : 'Создать базу'}
          </button>
          <button className="mw-button small" onClick={p.onClose}>
            Отмена
          </button>
        </div>
      )}
    </fieldset>
  );
}
