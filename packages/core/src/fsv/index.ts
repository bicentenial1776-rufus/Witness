/**
 * The FSV bridge: everything the world needs from the tree, and nothing
 * that knows how to draw. Rendering lives in apps/fsv; this package must
 * stay importable by the mobile app, which never loads three.js.
 */
export {
  resolveFsvProgram,
  fsvSeed,
  type FsvProgram,
  type FsvHousehold,
  type FsvConfidence
} from './program.js';
export {
  fsvHouseholdRecord,
  type FsvHouseholdRecord,
  type FsvDay,
  type FsvDayPerson,
  type FsvPerson
} from './household.js';
export { fsvCanEnter, type FsvDoor, type FsvDoorReason } from './enterable.js';
