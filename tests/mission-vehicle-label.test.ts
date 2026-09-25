import test from 'node:test';
import assert from 'node:assert/strict';
import {
  vehicleModelLabel,
  vehicleMapLabel,
  vehicleDisplayName,
} from '../lib/planner/mission-vehicle-label.ts';

void test('all TZ models are explicit in names and map labels', () => {
  for (const model of ['Gemini', '801', '201'] as const) {
    const vehicle = { model, name: 'БВС 03' };
    assert.match(vehicleDisplayName(vehicle), new RegExp(`Геоскан ${model}`));
    assert.match(vehicleMapLabel(vehicle, 2), new RegExp(`${model} · 03$`));
    assert.equal(vehicle.name, 'БВС 03');
    assert.equal(
      vehicleDisplayName({ model, name: `${model} · 6` }),
      `Геоскан ${model} · 6`,
    );
  }
});
void test('custom profiles never acquire a manufacturer label', () => {
  const vehicle = { model: 'Custom' as const, name: 'Учебный аппарат' };
  assert.equal(vehicleModelLabel(vehicle), 'Свой профиль БВС');
  assert.doesNotMatch(vehicleDisplayName(vehicle), /Геоскан|Gemini/);
  assert.equal(
    vehicleDisplayName({ model: '201', name: 'Геоскан 201 №4' }),
    'Геоскан 201 №4',
  );
});
