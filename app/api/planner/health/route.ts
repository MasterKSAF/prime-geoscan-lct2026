import { ENGINE_VERSION } from '@/lib/planner/schema';
import {
  MISSION_ENGINE_VERSION,
  MISSION_VERSION,
} from '@/lib/planner/mission-schema';
export function GET() {
  return Response.json({
    status: 'ok',
    engineVersion: ENGINE_VERSION,
    missionEngineVersion: MISSION_ENGINE_VERSION,
    missionSchemaVersion: MISSION_VERSION,
    safetyValidationPolicy: 'continuous-occupancy-v1',
    mode: 'engineering-preview',
    flightReady: false,
  });
}
