/**
 * The Street View viewer — scaffold tier.
 *
 * Renders a SceneSpec as a walkable world: era-profiled houses (merged
 * geometry, a handful of draw calls), evidence-band door markers, descent
 * roads, and tap-to-walk navigation with a self-managing camera (per the
 * design doc: one finger, no simultaneous inputs, drag-to-look optional).
 *
 * Deliberately omits (for now): interiors, figures, the Conductor, day/night.
 * Those port in from the demos behind this same createEngine() surface.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { EraCell, EvidenceBand, HouseholdSpec, SceneSpec } from '../spec/types.js';
import { hashStr, mulberry32 } from '../spec/rng.js';

export interface EngineCallbacks {
  /** A household was tapped (null = tapped empty ground). */
  onSelect?: (household: HouseholdSpec | null) => void;
}

export interface StreetViewEngine {
  dispose(): void;
  /** Walk the camera to a household's door (the "Guide me" primitive). */
  walkToHousehold(id: string): void;
}

interface EraProfile {
  w: number;
  d: number;
  h: number;
  pitch: number;
  wall: number;
  roof: number;
}

const ERA: Record<EraCell, EraProfile> = {
  england_hall: { w: 9.5, d: 6.8, h: 3.0, pitch: 0.9, wall: 0xcfc0a0, roof: 0x8a7a50 },
  colonial_hall: { w: 10.5, d: 8.4, h: 4.8, pitch: 0.85, wall: 0x8b7f6c, roof: 0x55493c },
  federal_farm: { w: 13.0, d: 8.6, h: 5.4, pitch: 0.5, wall: 0xd9d5c8, roof: 0x6a6258 },
  quebec_farm: { w: 10.2, d: 7.4, h: 3.2, pitch: 1.0, wall: 0xd6ccb4, roof: 0x74644c },
  milltown: { w: 9.2, d: 12.0, h: 8.4, pitch: 0.42, wall: 0xa3a396, roof: 0x5c5a58 },
  postwar: { w: 14.5, d: 9.2, h: 3.0, pitch: 0.33, wall: 0xb9b4a4, roof: 0x50504e },
};

const BAND_COLOR: Record<EvidenceBand, number> = {
  documented: 0xd8ad63,
  partial: 0x84a9c6,
  lost: 0x5f5f68,
  living: 0x82a077,
};

/** Gable prism: base w×d sitting at y=0, ridge along z at height `rise`. */
function prismGeo(w: number, rise: number, d: number): THREE.BufferGeometry {
  const w2 = w / 2;
  const d2 = d / 2;
  // outward-wound triangles (verified against face normals)
  // prettier-ignore
  const v = [
    -w2, 0, -d2,   0, rise, -d2,   w2, 0, -d2,                                    // back gable (-z)
     w2, 0,  d2,   0, rise,  d2,  -w2, 0,  d2,                                    // front gable (+z)
    -w2, 0, -d2,   0, rise,  d2,   0, rise, -d2,  -w2, 0, -d2,  -w2, 0, d2,  0, rise, d2, // left slope
     w2, 0, -d2,   0, rise, -d2,   0, rise,  d2,   w2, 0, -d2,   0, rise, d2,  w2, 0, d2, // right slope
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export function createEngine(
  canvas: HTMLCanvasElement,
  spec: SceneSpec,
  cb: EngineCallbacks = {},
): StreetViewEngine {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const scene = new THREE.Scene();
  const SKY = 0xa7bccf;
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 120, 1000);

  const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 2500);
  let yaw = 0;
  let pitch = -0.05;

  scene.add(new THREE.HemisphereLight(0xbfd0e0, 0x4a4434, 1.1));
  const sun = new THREE.DirectionalLight(0xfff0d0, 1.9);
  sun.position.set(220, 320, 120);
  scene.add(sun);

  // ── ground ──
  const maxR = spec.households.reduce((m, h) => Math.max(m, Math.hypot(h.x, h.z)), 100);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(maxR + 400, 64).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x55663c }),
  );
  scene.add(ground);

  // ── houses: merged geometry per material bucket ──
  const disposables: Array<{ dispose(): void }> = [ground.geometry, ground.material];
  const buckets = new Map<number, THREE.BufferGeometry[]>();
  const push = (color: number, geo: THREE.BufferGeometry, m: THREE.Matrix4) => {
    geo.applyMatrix4(m);
    const arr = buckets.get(color);
    if (arr) arr.push(geo);
    else buckets.set(color, [geo]);
  };

  const doorBuckets = new Map<EvidenceBand, THREE.BufferGeometry[]>();
  const pickGeo = new THREE.BoxGeometry(1, 1, 1);
  const pick = new THREE.InstancedMesh(
    pickGeo,
    new THREE.MeshBasicMaterial(),
    spec.households.length,
  );
  pick.visible = false;
  const pickIndex: HouseholdSpec[] = [];

  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  spec.households.forEach((h, i) => {
    const era = h.era ? ERA[h.era] : null;
    const rot = new THREE.Matrix4().makeRotationY(h.bearing);
    const at = (dx: number, dy: number, dz: number) =>
      new THREE.Matrix4()
        .makeTranslation(h.x, 0, h.z)
        .multiply(rot)
        .multiply(new THREE.Matrix4().makeTranslation(dx, dy, dz));

    if (era) {
      const rng = mulberry32(hashStr(h.id) ^ spec.seed);
      const scale = 0.92 + rng() * 0.16;
      const w = era.w * scale;
      const d = era.d * scale;
      const ht = era.h * scale;
      push(era.wall, new THREE.BoxGeometry(w, ht, d), at(0, ht / 2, 0));
      push(era.roof, prismGeo(w * 1.08, (w / 2) * era.pitch, d * 1.08), at(0, ht, 0));
      push(0x777066, new THREE.BoxGeometry(0.9, ht * 0.5, 0.9), at(w * 0.24, ht + (w / 2) * era.pitch * 0.4, 0));
      // door marker on the hub-facing face
      const door = new THREE.BoxGeometry(1.0, 2.1, 0.25);
      const arr = doorBuckets.get(h.band);
      const dg = door;
      dg.applyMatrix4(at(0, 1.05, d / 2 + 0.15));
      if (arr) arr.push(dg);
      else doorBuckets.set(h.band, [dg]);

      tmpQ.setFromAxisAngle(UP, h.bearing);
      tmpM.compose(new THREE.Vector3(h.x, (ht + 2) / 2, h.z), tmpQ, new THREE.Vector3(w + 2, ht + 4, d + 2));
    } else {
      // "records lost" ghost: a low platform and the band marker only
      push(0x6f6a5c, new THREE.BoxGeometry(7, 0.5, 5.6), at(0, 0.25, 0));
      const dg = new THREE.BoxGeometry(0.9, 1.8, 0.25);
      dg.applyMatrix4(at(0, 0.9, 3));
      const arr = doorBuckets.get(h.band);
      if (arr) arr.push(dg);
      else doorBuckets.set(h.band, [dg]);
      tmpQ.setFromAxisAngle(UP, h.bearing);
      tmpM.compose(new THREE.Vector3(h.x, 2, h.z), tmpQ, new THREE.Vector3(9, 4, 8));
    }
    pick.setMatrixAt(i, tmpM);
    pickIndex[i] = h;
  });
  pick.instanceMatrix.needsUpdate = true;
  scene.add(pick);

  for (const [color, geos] of buckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mat = new THREE.MeshLambertMaterial({ color });
    scene.add(new THREE.Mesh(merged, mat));
    disposables.push(merged, mat);
    geos.forEach((g) => g.dispose());
  }
  for (const [band, geos] of doorBuckets) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const mat = new THREE.MeshStandardMaterial({
      color: BAND_COLOR[band],
      emissive: BAND_COLOR[band],
      emissiveIntensity: band === 'lost' ? 0.1 : 0.8,
    });
    scene.add(new THREE.Mesh(merged, mat));
    disposables.push(merged, mat);
    geos.forEach((g) => g.dispose());
  }

  // ── descent roads ──
  {
    const byId = new Map(spec.households.map((h) => [h.id, h]));
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (const h of spec.households) {
      for (const p of [h.fatherFamilyId, h.motherFamilyId]) {
        const o = p ? byId.get(p) : undefined;
        if (!o) continue;
        c.setHex(BAND_COLOR[o.band]).multiplyScalar(0.7);
        pos.push(h.x, 0.15, h.z, o.x, 0.15, o.z);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 });
    scene.add(new THREE.LineSegments(g, m));
    disposables.push(g, m);
  }

  // ── camera start: at the anchor-era rim looking inward ──
  const newest = spec.households[spec.households.length - 1];
  const startR = newest ? Math.hypot(newest.x, newest.z) + 30 : 120;
  const startA = newest ? Math.atan2(newest.z, newest.x) : 0.6;
  const playerPos = new THREE.Vector3(Math.cos(startA) * startR, 1.7, Math.sin(startA) * startR);
  // face the hub: camera forward is (-sin yaw, -cos yaw)
  yaw = Math.atan2(playerPos.x, playerPos.z);
  let walkTarget: THREE.Vector3 | null = null;

  // ── input: drag = look, tap = walk/select (one finger, never both) ──
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downX = 0;
  let downY = 0;
  let moved = 0;
  let dragging = false;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    moved = 0;
    downX = e.clientX;
    downY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    moved += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * 0.0034;
    pitch = Math.max(-1.2, Math.min(1.1, pitch - dy * 0.0028));
    downX = e.clientX;
    downY = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    dragging = false;
    if (moved > 10) return; // it was a look-drag, not a tap
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hitHouse = ray.intersectObject(pick, false)[0];
    if (hitHouse && hitHouse.instanceId != null) {
      const h = pickIndex[hitHouse.instanceId];
      cb.onSelect?.(h);
      walkToward(h);
      return;
    }
    const hitGround = ray.intersectObject(ground, false)[0];
    if (hitGround) {
      walkTarget = hitGround.point.clone().setY(1.7);
      cb.onSelect?.(null);
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);

  // optional desktop WASD (explorer mode)
  const keys = new Set<string>();
  const onKey = (e: KeyboardEvent) => {
    if (e.type === 'keydown') keys.add(e.code);
    else keys.delete(e.code);
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  function walkToward(h: HouseholdSpec) {
    // stand in front of the door (hub side), a few metres out
    const era = h.era ? ERA[h.era] : null;
    const depth = era ? era.d / 2 + 5 : 6;
    const s = Math.sin(h.bearing);
    const c = Math.cos(h.bearing);
    walkTarget = new THREE.Vector3(h.x + s * depth, 1.7, h.z + c * depth);
  }

  // ── resize ──
  const fit = () => {
    const w = canvas.clientWidth || canvas.parentElement?.clientWidth || 800;
    const h = canvas.clientHeight || canvas.parentElement?.clientHeight || 600;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();

  // ── loop ──
  let raf = 0;
  let last = performance.now();
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (walkTarget) {
      const to = walkTarget.clone().sub(playerPos);
      to.y = 0;
      const d = to.length();
      if (d < 0.4) walkTarget = null;
      else {
        to.normalize();
        playerPos.addScaledVector(to, Math.min(d, 26 * dt));
        // the camera manages itself: ease yaw toward the walk direction
        const want = Math.atan2(-to.x, -to.z);
        const diff = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
        yaw += diff * Math.min(1, dt * 3.2);
      }
    }
    // WASD explorer mode
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    if (f || s) {
      walkTarget = null;
      const sp = (keys.has('ShiftLeft') ? 60 : 18) * dt;
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      playerPos.x += (fx * f - fz * s) * sp;
      playerPos.z += (fz * f + fx * s) * sp;
    }

    camera.position.copy(playerPos);
    camera.rotation.set(0, 0, 0, 'YXZ');
    camera.rotateY(yaw);
    camera.rotateX(pitch);
    renderer.render(scene, camera);
  };
  tick();

  return {
    walkToHousehold(id: string) {
      const h = spec.households.find((x) => x.id === id);
      if (h) walkToward(h);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      disposables.forEach((d) => d.dispose());
      pickGeo.dispose();
      renderer.dispose();
    },
  };
}
