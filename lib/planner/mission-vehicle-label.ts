import type { Vehicle } from './schema.ts';

type NamedVehicle = Pick<Vehicle, 'model' | 'name'>;

/** Presentation only: never rewrite imported aircraft names or evidence. */
export function vehicleModelLabel(vehicle: Pick<Vehicle, 'model'>): string {
  switch (vehicle.model) {
    case 'Gemini':
      return 'Геоскан Gemini';
    case '801':
      return 'Геоскан 801';
    case '201':
      return 'Геоскан 201';
    default:
      return 'Свой профиль БВС';
  }
}

export function vehicleMapLabel(vehicle: NamedVehicle, index: number): string {
  const model =
    vehicle.model === 'Gemini' ? 'Gemini' : vehicleModelLabel(vehicle);
  return `${model} · ${String(Math.max(0, index) + 1).padStart(2, '0')}`;
}

export function vehicleDisplayName(vehicle: NamedVehicle): string {
  const model = vehicleModelLabel(vehicle);
  if (vehicle.name.toLocaleLowerCase().includes(model.toLocaleLowerCase()))
    return vehicle.name;
  if (
    vehicle.model !== 'Custom' &&
    vehicle.name
      .toLocaleLowerCase()
      .startsWith(`${vehicle.model.toLocaleLowerCase()} ·`)
  )
    return `Геоскан ${vehicle.name}`;
  return `${model} · ${vehicle.name}`;
}
