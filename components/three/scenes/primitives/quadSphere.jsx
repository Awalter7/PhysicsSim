import * as THREE from "three"
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function buildFaceGeometry(faceNormal, resolution, radius, sphereAmount = 1) {
  const tangentA = new THREE.Vector3(faceNormal.y, faceNormal.z, faceNormal.x);
  const tangentB = new THREE.Vector3().crossVectors(faceNormal, tangentA);

  const vertexCount = (resolution + 1) * (resolution + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals   = new Float32Array(vertexCount * 3);

  for (let row = 0; row <= resolution; row++) {
    for (let col = 0; col <= resolution; col++) {
      const faceU = col / resolution;
      const faceV = row / resolution;
      const vertexIndex = row * (resolution + 1) + col;

      const cubePoint = new THREE.Vector3()
        .copy(faceNormal)
        .addScaledVector(tangentA, (faceU - 0.5) * 2)
        .addScaledVector(tangentB, (faceV - 0.5) * 2);

      const spherePoint = cubePoint.clone().normalize();
      const blendedPoint = cubePoint.clone().lerp(spherePoint, sphereAmount);
      const vertexNormal = blendedPoint.clone().normalize();

      positions[vertexIndex * 3 + 0] = blendedPoint.x * radius;
      positions[vertexIndex * 3 + 1] = blendedPoint.y * radius;
      positions[vertexIndex * 3 + 2] = blendedPoint.z * radius;

      normals[vertexIndex * 3 + 0] = vertexNormal.x;
      normals[vertexIndex * 3 + 1] = vertexNormal.y;
      normals[vertexIndex * 3 + 2] = vertexNormal.z;
    }
  }

  const indexCount = resolution * resolution * 6;
  const indices = new Uint32Array(indexCount);
  let indexOffset = 0;

  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const topLeft     = row * (resolution + 1) + col;
      const topRight    = topLeft + 1;
      const bottomLeft  = topLeft + (resolution + 1);
      const bottomRight = bottomLeft + 1;

      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = bottomRight;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = topRight;
      indices[indexOffset++] = bottomRight;
    }
  }

  const faceGeometry = new THREE.BufferGeometry();
  faceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  faceGeometry.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  faceGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return faceGeometry;
}

function cubePointToSphereDirection(faceNormal, tangentA, tangentB, faceU, faceV, sphereAmount = 1) {
  const cubePoint = new THREE.Vector3()
    .copy(faceNormal)
    .addScaledVector(tangentA, (faceU - 0.5) * 2)
    .addScaledVector(tangentB, (faceV - 0.5) * 2);

  if (sphereAmount === 1) {
    const length = cubePoint.length();
    return length === 0 ? faceNormal.clone() : cubePoint.divideScalar(length);
  }

  return cubePoint.lerp(cubePoint.clone().normalize(), sphereAmount);
}

function isOccludedByOccluders(targetCenter, targetRadius, cameraLocalPos, occluders) {
  if (!occluders || occluders.length === 0) return false;

  const toTargetX = targetCenter.x - cameraLocalPos.x;
  const toTargetY = targetCenter.y - cameraLocalPos.y;
  const toTargetZ = targetCenter.z - cameraLocalPos.z;
  const distToTarget = Math.sqrt(toTargetX*toTargetX + toTargetY*toTargetY + toTargetZ*toTargetZ);

  if (distToTarget <= targetRadius) return false;

  const sinTargetAngle = targetRadius / distToTarget;
  const sinTargetAngleSq = sinTargetAngle * sinTargetAngle;
  if (sinTargetAngleSq >= 1) return false;
  const cosTargetAngle = Math.sqrt(1 - sinTargetAngleSq);

  for (let i = 0; i < occluders.length; i++) {
    const occluder = occluders[i];
    const toOccluderX = occluder.center.x - cameraLocalPos.x;
    const toOccluderY = occluder.center.y - cameraLocalPos.y;
    const toOccluderZ = occluder.center.z - cameraLocalPos.z;
    const distToOccluder = Math.sqrt(toOccluderX*toOccluderX + toOccluderY*toOccluderY + toOccluderZ*toOccluderZ);

    if (distToOccluder <= occluder.radius) continue;
    if (distToOccluder + occluder.radius >= distToTarget - targetRadius) continue;

    const sinOccluderAngle = occluder.radius / distToOccluder;
    const cosOccluderAngle = Math.sqrt(1 - sinOccluderAngle * sinOccluderAngle);

    const dotTargetOccluder = toTargetX*toOccluderX + toTargetY*toOccluderY + toTargetZ*toOccluderZ;
    const cosAngleBetween = dotTargetOccluder / (distToTarget * distToOccluder);

    if (cosAngleBetween <= cosOccluderAngle) continue;

    const sinAngleBetween = Math.sqrt(Math.max(0, 1 - cosAngleBetween * cosAngleBetween));
    const cosTargetPlusAngle = cosAngleBetween * cosTargetAngle - sinAngleBetween * sinTargetAngle;

    if (cosTargetPlusAngle > cosOccluderAngle) return true;
  }

  return false;
}

class QuadNode {
  constructor(faceNormal, tangentA, tangentB, tileOffset, tileSize, radius, lodSteps, depth, sphereAmount) {
    this.faceNormal = faceNormal;
    this.tangentA = tangentA;
    this.tangentB = tangentB;
    this.tileOffset = tileOffset;
    this.tileSize = tileSize;
    this.radius = radius;
    this.lodSteps = lodSteps;
    this.depth = depth;
    this.maxDepth = lodSteps.dists.length;
    this.sphereAmount = sphereAmount;

    this.children = [];
    this.geometry = null;

    const uMin = tileOffset.x, vMin = tileOffset.y;
    const uMax = tileOffset.x + tileSize, vMax = tileOffset.y + tileSize;
    const uCenter = uMin + tileSize * 0.5, vCenter = vMin + tileSize * 0.5;

    this._cornerDirections = [
      cubePointToSphereDirection(faceNormal, tangentA, tangentB, uMin, vMin, sphereAmount),
      cubePointToSphereDirection(faceNormal, tangentA, tangentB, uMax, vMin, sphereAmount),
      cubePointToSphereDirection(faceNormal, tangentA, tangentB, uMin, vMax, sphereAmount),
      cubePointToSphereDirection(faceNormal, tangentA, tangentB, uMax, vMax, sphereAmount),
    ];
    this._centerDirection = cubePointToSphereDirection(faceNormal, tangentA, tangentB, uCenter, vCenter, sphereAmount);

    this.boundingSphere = new THREE.Sphere().setFromPoints(
      this._cornerDirections.map(direction => direction.clone().multiplyScalar(radius))
    );

    this._tileSurfaceCenter = this._centerDirection.clone().multiplyScalar(radius);
  }

  _buildLeafGeometry() {
    const { faceNormal, tangentA, tangentB, tileOffset, tileSize, radius, sphereAmount } = this;
    const uMin = tileOffset.x, vMin = tileOffset.y;
    const uMax = tileOffset.x + tileSize, vMax = tileOffset.y + tileSize;

    const cornerUVs = [[uMin, vMin], [uMax, vMin], [uMin, vMax], [uMax, vMax]];
    const positions = new Float32Array(4 * 3);
    const normals   = new Float32Array(4 * 3);

    cornerUVs.forEach(([u, v], i) => {
      const direction = cubePointToSphereDirection(faceNormal, tangentA, tangentB, u, v, sphereAmount);
      const vertexNormal = direction.clone().normalize();

      positions[i * 3 + 0] = direction.x * radius;
      positions[i * 3 + 1] = direction.y * radius;
      positions[i * 3 + 2] = direction.z * radius;

      normals[i * 3 + 0] = vertexNormal.x;
      normals[i * 3 + 1] = vertexNormal.y;
      normals[i * 3 + 2] = vertexNormal.z;
    });

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 3, 2, 0, 1, 3]), 1));
  }

  _ensureLeafGeometry() {
    if (!this.geometry) this._buildLeafGeometry();
  }

  splitIntoChildren() {
    const childDepth = this.depth + 1;
    const childGridSize = this.lodSteps.detail[childDepth];
    const childTileSize = this.tileSize / childGridSize;

    for (let row = 0; row < childGridSize; row++) {
      for (let col = 0; col < childGridSize; col++) {
        this.children.push(new QuadNode(
          this.faceNormal, this.tangentA, this.tangentB,
          new THREE.Vector2(this.tileOffset.x + col * childTileSize, this.tileOffset.y + row * childTileSize),
          childTileSize, this.radius, this.lodSteps, childDepth, this.sphereAmount,
        ));
      }
    }
  }

  mergeChildren() {
    for (const child of this.children) child.dispose();
    this.children = [];
  }

  cullSelf() {
    this.mergeChildren();
    if (this.geometry) { this.geometry.dispose(); this.geometry = null; }
  }

  hasChildren() { return this.children.length > 0; }

  dispose() {
    this.mergeChildren();
    if (this.geometry) { this.geometry.dispose(); this.geometry = null; }
  }
}

class QuadTree {
  constructor(faceNormal, radius, lodSteps, sphereAmount) {
    this.faceNormal = faceNormal;
    this.radius = radius;
    this.lodSteps = lodSteps;
    this.maxDepth = lodSteps.dists.length;

    const tangentA = new THREE.Vector3(faceNormal.y, faceNormal.z, faceNormal.x);
    const tangentB = new THREE.Vector3().crossVectors(faceNormal, tangentA);

    this._rootNodes = this._buildRootNodes(faceNormal, tangentA, tangentB, radius, lodSteps, sphereAmount);
  }

  _buildRootNodes(faceNormal, tangentA, tangentB, radius, lodSteps, sphereAmount) {
    const rootGridSize = lodSteps.detail[0];
    const rootTileSize = 1.0 / rootGridSize;
    const rootNodes = [];

    for (let row = 0; row < rootGridSize; row++) {
      for (let col = 0; col < rootGridSize; col++) {
        const node = new QuadNode(
          faceNormal, tangentA, tangentB,
          new THREE.Vector2(col * rootTileSize, row * rootTileSize),
          rootTileSize, radius, lodSteps, 0, sphereAmount,
        );
        node._buildLeafGeometry();
        rootNodes.push(node);
      }
    }
    return rootNodes;
  }

  _updateNode(node, cameraLocalPos, frustum, cullContext) {
    let shouldSplit = false;
    if (node.depth < this.maxDepth) {
      const distanceToCamera = cameraLocalPos.distanceTo(node.boundingSphere.center);
      if (distanceToCamera === undefined) return;
      shouldSplit = distanceToCamera < this.lodSteps.dists[node.depth];
    }

    if (shouldSplit) {
      if (!node.hasChildren()) node.splitIntoChildren();
      if (node.geometry) { node.geometry.dispose(); node.geometry = null; }
      for (const child of node.children) this._updateNode(child, cameraLocalPos, frustum, cullContext);
      return;
    }

    if (node.hasChildren()) node.mergeChildren();

    if (!frustum.intersectsSphere(node.boundingSphere)) { node.cullSelf(); return; }

    if (cullContext?.occluders?.length > 0) {
      if (isOccludedByOccluders(node.boundingSphere.center, node.boundingSphere.radius, cullContext.cameraLocalPos, cullContext.occluders)) {
        node.cullSelf();
        return;
      }
    }

    node._ensureLeafGeometry();
  }

  update(cameraLocalPos, frustum, cullContext) {
    for (const rootNode of this._rootNodes) this._updateNode(rootNode, cameraLocalPos, frustum, cullContext);
  }

  _collectLeafGeometries(node, result) {
    if (!node.hasChildren()) {
      if (node.geometry) result.push(node.geometry);
    } else {
      for (const child of node.children) this._collectLeafGeometries(child, result);
    }
  }

  getLeafGeometries() {
    const leafGeometries = [];
    for (const rootNode of this._rootNodes) this._collectLeafGeometries(rootNode, leafGeometries);
    return leafGeometries;
  }

  dispose() {
    for (const rootNode of this._rootNodes) rootNode.dispose();
  }
}

export default class QuadSphere {
  constructor(
    lodSteps = { dists: [2000000, 20000, 1000, 100], detail: [25, 50, 75, 100] },
    radius = 1,
    sphereAmount = 1,
  ) {
    this.lodSteps = lodSteps;
    this.radius = radius;
    this.sphereAmount = sphereAmount;

    this.geometry = new THREE.BufferGeometry();
    this.occluders = [];
    this._occluderObjects = [];
    this._scratchBox = new THREE.Box3();
    this._scratchVec = new THREE.Vector3();

    const faceNormals = [
      new THREE.Vector3( 0,  1,  0),
      new THREE.Vector3( 0, -1,  0),
      new THREE.Vector3(-1,  0,  0),
      new THREE.Vector3( 1,  0,  0),
      new THREE.Vector3( 0,  0,  1),
      new THREE.Vector3( 0,  0, -1),
    ];

    this.quadTrees = faceNormals.map(faceNormal => new QuadTree(faceNormal, radius, lodSteps, sphereAmount));

    this._frustum = new THREE.Frustum();
    this._cameraProjectionMatrix = new THREE.Matrix4();
    this._rebuildGeometry();
  }

  addOccluder(occluder) { this.occluders.push(occluder); }
  setOccluders(occluderList) { this.occluders = occluderList || []; }
  clearOccluders() { this.occluders = []; this._occluderObjects = []; }

  addOccluderObject(object) {
    if (object && this._occluderObjects.indexOf(object) === -1) this._occluderObjects.push(object);
  }

  removeOccluderObject(object) {
    const index = this._occluderObjects.indexOf(object);
    if (index !== -1) this._occluderObjects.splice(index, 1);
  }

  _occluderSphereFromObject(object) {
    object.updateWorldMatrix(true, false);

    if (object.geometry) {
      if (!object.geometry.boundingSphere) {
        try { object.geometry.computeBoundingSphere(); } catch (_) {}
      }
      const boundingSphere = object.geometry.boundingSphere;
      if (boundingSphere && isFinite(boundingSphere.radius) && boundingSphere.radius > 0) {
        const center = boundingSphere.center.clone().applyMatrix4(object.matrixWorld);
        const worldScale = this._scratchVec.setFromMatrixScale(object.matrixWorld);
        const maxScale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z));
        return { center, radius: boundingSphere.radius * maxScale, source: object };
      }
    }

    this._scratchBox.makeEmpty();
    this._scratchBox.expandByObject(object);
    if (this._scratchBox.isEmpty()) return null;

    const center = new THREE.Vector3();
    this._scratchBox.getCenter(center);
    const boxSize = this._scratchBox.getSize(this._scratchVec);
    const radius = 0.5 * Math.max(boxSize.x, boxSize.y, boxSize.z);
    if (!isFinite(radius) || radius <= 0) return null;

    return { center, radius, source: object };
  }

  update(camera, meshWorldMatrix) {
    camera.updateMatrixWorld();
    this._cameraProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    this._localProjectionMatrix = this._localProjectionMatrix || new THREE.Matrix4();
    this._localProjectionMatrix.multiplyMatrices(this._cameraProjectionMatrix, meshWorldMatrix);
    this._frustum.setFromProjectionMatrix(this._localProjectionMatrix);

    const meshWorldInverse = new THREE.Matrix4().copy(meshWorldMatrix).invert();
    const cameraLocalPos = camera.position.clone().applyMatrix4(meshWorldInverse);

    let frameOccluders = null;
    if (this.occluders.length > 0 || this._occluderObjects.length > 0) {
      frameOccluders = [];
      for (const occluder of this.occluders) {
        frameOccluders.push({ center: this._scratchVec.copy(occluder.center).applyMatrix4(meshWorldInverse).clone(), radius: occluder.radius });
      }
      for (const object of this._occluderObjects) {
        const sphere = this._occluderSphereFromObject(object);
        if (sphere) { sphere.center.applyMatrix4(meshWorldInverse); frameOccluders.push(sphere); }
      }
    }

    const cullContext = { cameraLocalPos, occluders: frameOccluders };

    for (const quadTree of this.quadTrees) quadTree.update(cameraLocalPos, this._frustum, cullContext);
    this._rebuildGeometry();
  }

  _rebuildGeometry() {
    const leafGeometries = this.quadTrees.flatMap(quadTree => quadTree.getLeafGeometries());
    if (leafGeometries.length === 0) {
      this.geometry.dispose();
      this.geometry.copy(new THREE.BufferGeometry());
      return;
    }
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(leafGeometries, false);
    this.geometry.disposeBoundsTree?.();
    this.geometry.dispose();
    this.geometry.copy(mergedGeometry);

    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), this.radius);
    this.geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(-this.radius, -this.radius, -this.radius),
      new THREE.Vector3( this.radius,  this.radius,  this.radius),
    );

    this.geometry.computeBoundsTree?.();
  }

  dispose() {
    for (const quadTree of this.quadTrees) quadTree.dispose();
    this.geometry.dispose();
  }
}
