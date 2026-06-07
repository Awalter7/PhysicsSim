import * as THREE from "three"
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function buildFaceGeometry(localUp, resolution, radius, sphereAmount = 1) {
  const axisA = new THREE.Vector3(localUp.y, localUp.z, localUp.x);
  const axisB = new THREE.Vector3().crossVectors(localUp, axisA);

  const vertCount = (resolution + 1) * (resolution + 1);
  const positions = new Float32Array(vertCount * 3);
  const normals   = new Float32Array(vertCount * 3);

  for (let row = 0; row <= resolution; row++) {
    for (let col = 0; col <= resolution; col++) {
      const u = col / resolution;
      const v = row / resolution;
      const i = row * (resolution + 1) + col;

      const cube = new THREE.Vector3()
        .copy(localUp)
        .addScaledVector(axisA, (u - 0.5) * 2)
        .addScaledVector(axisB, (v - 0.5) * 2);

      const pos = cube.clone().lerp(cube.clone().normalize(), sphereAmount);
      const normal = pos.clone().normalize();

      positions[i * 3 + 0] = pos.x * radius;
      positions[i * 3 + 1] = pos.y * radius;
      positions[i * 3 + 2] = pos.z * radius;

      normals[i * 3 + 0] = normal.x;
      normals[i * 3 + 1] = normal.y;
      normals[i * 3 + 2] = normal.z;
    }
  }

  const indexCount = resolution * resolution * 6;
  const indices = new Uint32Array(indexCount);
  let idx = 0;

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const a = row * (resolution + 1) + col;
      const b = a + 1;
      const c = a + (resolution + 1);
      const d = c + 1;

      indices[idx++] = a;
      indices[idx++] = d;
      indices[idx++] = c;
      indices[idx++] = a;
      indices[idx++] = b;
      indices[idx++] = d;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}

function cubeToSphere(localUp, axisA, axisB, u, v, sphereAmount = 1) {
  const cube = new THREE.Vector3()
    .copy(localUp)
    .addScaledVector(axisA, (u - 0.5) * 2)
    .addScaledVector(axisB, (v - 0.5) * 2);

  if (sphereAmount === 1) {
    const len = cube.length();
    return len === 0 ? localUp.clone() : cube.divideScalar(len);
  }

  return cube.lerp(cube.clone().normalize(), sphereAmount);
}

function isOccludedByOccluders(targetCenterWorld, targetRadius, cameraWorldPos, occluders) {
  if (!occluders || occluders.length === 0) return false;

  const tx = targetCenterWorld.x - cameraWorldPos.x;
  const ty = targetCenterWorld.y - cameraWorldPos.y;
  const tz = targetCenterWorld.z - cameraWorldPos.z;
  const dT = Math.sqrt(tx*tx + ty*ty + tz*tz);

  if (dT <= targetRadius) return false;

  const sinAT = targetRadius / dT;
  const sinATsq = sinAT * sinAT;
  if (sinATsq >= 1) return false;
  const cosAT = Math.sqrt(1 - sinATsq);

  for (let i = 0; i < occluders.length; i++) {
    const occ = occluders[i];
    const ox = occ.center.x - cameraWorldPos.x;
    const oy = occ.center.y - cameraWorldPos.y;
    const oz = occ.center.z - cameraWorldPos.z;
    const dO = Math.sqrt(ox*ox + oy*oy + oz*oz);

    if (dO <= occ.radius) continue;
    if (dO + occ.radius >= dT - targetRadius) continue;

    const sinAO = occ.radius / dO;
    const cosAO = Math.sqrt(1 - sinAO * sinAO);

    const dot = tx*ox + ty*oy + tz*oz;
    const cosTheta = dot / (dT * dO);

    if (cosTheta <= cosAO) continue;

    const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
    const cosThetaPlusAT = cosTheta * cosAT - sinTheta * sinAT;

    if (cosThetaPlusAT > cosAO) return true;
  }

  return false;
}

class QuadNode {
  constructor(localUp, axisA, axisB, offset, size, radius, steps, depth, sphereAmount) {
    this.localUp = localUp;
    this.axisA = axisA;
    this.axisB = axisB;
    this.offset = offset;
    this.size = size;
    this.radius = radius;
    this.steps = steps;
    this.depth = depth;
    this.maxDepth = steps.dists.length;
    this.sphereAmount = sphereAmount;

    this.children = [];
    this.geometry = null;

    const u0 = offset.x, v0 = offset.y;
    const u1 = offset.x + size, v1 = offset.y + size;
    const uc = u0 + size * 0.5, vc = v0 + size * 0.5;

    this._corners = [
      cubeToSphere(localUp, axisA, axisB, u0, v0, sphereAmount),
      cubeToSphere(localUp, axisA, axisB, u1, v0, sphereAmount),
      cubeToSphere(localUp, axisA, axisB, u0, v1, sphereAmount),
      cubeToSphere(localUp, axisA, axisB, u1, v1, sphereAmount),
    ];
    this._sphereCenter = cubeToSphere(localUp, axisA, axisB, uc, vc, sphereAmount);

    this.boundingSphere = new THREE.Sphere().setFromPoints(
      this._corners.map(c => c.clone().multiplyScalar(radius))
    );

    this._tileLocalPos = this._sphereCenter.clone().multiplyScalar(radius);
  }

  buildGeometry() {
    const { localUp, axisA, axisB, offset, size, radius, sphereAmount } = this;
    const u0 = offset.x, v0 = offset.y;
    const u1 = offset.x + size, v1 = offset.y + size;
    const corners = [[u0, v0], [u1, v0], [u0, v1], [u1, v1]];

    const positions = new Float32Array(4 * 3);
    const normals   = new Float32Array(4 * 3);

    corners.forEach(([u, v], i) => {
      const point = cubeToSphere(localUp, axisA, axisB, u, v, sphereAmount);
      const normal = point.clone().normalize();

      positions[i * 3 + 0] = point.x * radius;
      positions[i * 3 + 1] = point.y * radius;
      positions[i * 3 + 2] = point.z * radius;

      normals[i * 3 + 0] = normal.x;
      normals[i * 3 + 1] = normal.y;
      normals[i * 3 + 2] = normal.z;
    });

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 3, 2, 0, 1, 3]), 1));
  }

  ensureGeometry() {
    if (!this.geometry) this.buildGeometry();
  }

  split() {
    const nextDepth = this.depth + 1;
    const gridSize = this.steps.detail[nextDepth];
    const childSize = this.size / gridSize;

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        this.children.push(new QuadNode(
          this.localUp, this.axisA, this.axisB,
          new THREE.Vector2(this.offset.x + col * childSize, this.offset.y + row * childSize),
          childSize, this.radius, this.steps, nextDepth, this.sphereAmount,
        ));
      }
    }
  }

  merge() {
    for (const child of this.children) child.dispose();
    this.children = [];
  }

  cull() {
    this.merge();
    if (this.geometry) { this.geometry.dispose(); this.geometry = null; }
  }

  isSplit() { return this.children.length > 0; }

  dispose() {
    this.merge();
    if (this.geometry) { this.geometry.dispose(); this.geometry = null; }
  }
}

class QuadTree {
  constructor(localUp, radius, steps, sphereAmount) {
    this.localUp = localUp;
    this.radius = radius;
    this.steps = steps;
    this.maxDepth = steps.dists.length;

    const axisA = new THREE.Vector3(localUp.y, localUp.z, localUp.x);
    const axisB = new THREE.Vector3().crossVectors(localUp, axisA);

    this._roots = this._buildRootGrid(localUp, axisA, axisB, radius, steps, sphereAmount);
  }

  _buildRootGrid(localUp, axisA, axisB, radius, steps, sphereAmount) {
    const gridSize = steps.detail[0];
    const cellSize = 1.0 / gridSize;
    const roots = [];

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const node = new QuadNode(
          localUp, axisA, axisB,
          new THREE.Vector2(col * cellSize, row * cellSize),
          cellSize, radius, steps, 0, sphereAmount,
        );
        node.buildGeometry();
        roots.push(node);
      }
    }
    return roots;
  }

  _update(node, cameraPosition, frustum, ctx) {
    let shouldSplit = false;
    if (node.depth < this.maxDepth) {
      const distToCamera = cameraPosition.distanceTo(node.boundingSphere.center);
      if (distToCamera === undefined) return;
      shouldSplit = distToCamera < this.steps.dists[node.depth];
    }

    if (shouldSplit) {
      if (!node.isSplit()) node.split();
      if (node.geometry) { node.geometry.dispose(); node.geometry = null; }
      for (const child of node.children) this._update(child, cameraPosition, frustum, ctx);
      return;
    }

    if (node.isSplit()) node.merge();

    if (!frustum.intersectsSphere(node.boundingSphere)) { node.cull(); return; }

    const camDist = cameraPosition.length();
    if (camDist > this.radius) {
      const dot =
        (cameraPosition.x - node._tileLocalPos.x) * node._sphereCenter.x +
        (cameraPosition.y - node._tileLocalPos.y) * node._sphereCenter.y +
        (cameraPosition.z - node._tileLocalPos.z) * node._sphereCenter.z;
      if (dot < 0) { node.cull(); return; }
    }

    if (ctx?.occluders?.length > 0) {
      if (isOccludedByOccluders(node.boundingSphere.center, node.boundingSphere.radius, ctx.cameraLocalPos, ctx.occluders)) {
        node.cull();
        return;
      }
    }

    node.ensureGeometry();
  }

  update(cameraPosition, frustum, ctx) {
    for (const root of this._roots) this._update(root, cameraPosition, frustum, ctx);
  }

  _collectGeometries(node, result) {
    if (!node.isSplit()) {
      if (node.geometry) result.push(node.geometry);
    } else {
      for (const child of node.children) this._collectGeometries(child, result);
    }
  }

  getGeometries() {
    const result = [];
    for (const root of this._roots) this._collectGeometries(root, result);
    return result;
  }

  dispose() {
    for (const root of this._roots) root.dispose();
  }
}

export default class QuadSphere {
  constructor(
    steps = { dists: [2000000, 20000, 1000, 100], detail: [25, 50, 75, 100] },
    radius = 1,
    sphereAmount = 1,
  ) {
    this.steps = steps;
    this.radius = radius;
    this.sphereAmount = sphereAmount;

    this.geometry = new THREE.BufferGeometry();
    this.occluders = [];
    this._occluderObjects = [];
    this._scratchBox = new THREE.Box3();
    this._scratchVec = new THREE.Vector3();

    const directions = [
      new THREE.Vector3( 0,  1,  0),
      new THREE.Vector3( 0, -1,  0),
      new THREE.Vector3(-1,  0,  0),
      new THREE.Vector3( 1,  0,  0),
      new THREE.Vector3( 0,  0,  1),
      new THREE.Vector3( 0,  0, -1),
    ];

    this.quadTrees = directions.map(dir => new QuadTree(dir, radius, steps, sphereAmount));

    this._frustum = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();
    this._rebuildGeometry();
  }

  addOccluder(occluder) { this.occluders.push(occluder); }
  setOccluders(arr) { this.occluders = arr || []; }
  clearOccluders() { this.occluders = []; this._occluderObjects = []; }

  addOccluderObject(obj) {
    if (obj && this._occluderObjects.indexOf(obj) === -1) this._occluderObjects.push(obj);
  }

  removeOccluderObject(obj) {
    const i = this._occluderObjects.indexOf(obj);
    if (i !== -1) this._occluderObjects.splice(i, 1);
  }

  _occluderSphereFromObject(obj) {
    obj.updateWorldMatrix(true, false);

    if (obj.geometry) {
      if (!obj.geometry.boundingSphere) {
        try { obj.geometry.computeBoundingSphere(); } catch (_) {}
      }
      const bs = obj.geometry.boundingSphere;
      if (bs && isFinite(bs.radius) && bs.radius > 0) {
        const center = bs.center.clone().applyMatrix4(obj.matrixWorld);
        const scale = this._scratchVec.setFromMatrixScale(obj.matrixWorld);
        const maxScale = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
        return { center, radius: bs.radius * maxScale, source: obj };
      }
    }

    this._scratchBox.makeEmpty();
    this._scratchBox.expandByObject(obj);
    if (this._scratchBox.isEmpty()) return null;

    const center = new THREE.Vector3();
    this._scratchBox.getCenter(center);
    const size = this._scratchBox.getSize(this._scratchVec);
    const radius = 0.5 * Math.max(size.x, size.y, size.z);
    if (!isFinite(radius) || radius <= 0) return null;

    return { center, radius, source: obj };
  }

  update(camera, meshWorldMatrix) {
    camera.updateMatrixWorld();
    this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    this._localProjScreenMatrix = this._localProjScreenMatrix || new THREE.Matrix4();
    this._localProjScreenMatrix.multiplyMatrices(this._projScreenMatrix, meshWorldMatrix);
    this._frustum.setFromProjectionMatrix(this._localProjScreenMatrix);

    const inverseMatrix = new THREE.Matrix4().copy(meshWorldMatrix).invert();
    const localCameraPos = camera.position.clone().applyMatrix4(inverseMatrix);

    let frameOccluders = null;
    if (this.occluders.length > 0 || this._occluderObjects.length > 0) {
      frameOccluders = [];
      for (const occ of this.occluders) {
        frameOccluders.push({ center: this._scratchVec.copy(occ.center).applyMatrix4(inverseMatrix).clone(), radius: occ.radius });
      }
      for (const obj of this._occluderObjects) {
        const sph = this._occluderSphereFromObject(obj);
        if (sph) { sph.center.applyMatrix4(inverseMatrix); frameOccluders.push(sph); }
      }
    }

    const ctx = { cameraLocalPos: localCameraPos, occluders: frameOccluders };

    for (const qt of this.quadTrees) qt.update(localCameraPos, this._frustum, ctx);
    this._rebuildGeometry();
  }

  _rebuildGeometry() {
    const leafGeometries = this.quadTrees.flatMap(qt => qt.getGeometries());
    if (leafGeometries.length === 0) {
      this.geometry.dispose();
      this.geometry.copy(new THREE.BufferGeometry());
      return;
    }
    const merged = BufferGeometryUtils.mergeGeometries(leafGeometries, false);
    this.geometry.disposeBoundsTree?.();
    this.geometry.dispose();
    this.geometry.copy(merged);

    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), this.radius);
    this.geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-this.radius, -this.radius, -this.radius),
      new THREE.Vector3( this.radius,  this.radius,  this.radius),
    );

    this.geometry.computeBoundsTree?.();
  }

  dispose() {
    for (const qt of this.quadTrees) qt.dispose();
    this.geometry.dispose();
  }
}
