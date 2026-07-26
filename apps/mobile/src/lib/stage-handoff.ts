// The Register hands a household to the Family Stage across navigation:
// a register row pushes home and the stage opens on that family. Module
// state, consumed once — no route params, no re-render loops.
let pendingStageKey: string | null = null;

export function setPendingStage(key: string): void {
  pendingStageKey = key;
}

export function consumePendingStage(): string | null {
  const key = pendingStageKey;
  pendingStageKey = null;
  return key;
}
