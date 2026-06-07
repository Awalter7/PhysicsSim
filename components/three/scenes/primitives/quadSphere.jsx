import * as THREE from "three"
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ── Noise ─────────────────────────────────────────────────────────────────────

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function fbm(x, y, z, { octaves = 5, lacunarity = 2.0, persistence = 0.5, seed = 0 } = {}) {
  let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value    += gradientNoise(x * frequency, y * frequency, z * frequency, seed + i) * amplitude;
    maxValue += amplitude;
    amplitude  *= persistence;
    frequency  *= lacunarity;
  }
  return value / maxValue;
}

function gradientNoise(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const hash = (a, b, c) => {
    let n = (a + seed * 1619) * 1619 + (b + seed * 31337) * 31337 + c * 6971;
    n = (n ^ (n >>> 13)) * 1274126177;
    n = n ^ (n >>> 16);
    return ((n >>> 0) / 0xffffffff) * 2 - 1;
  };

  return (
    hash(ix,   iy,   iz  ) * (1-ux) * (1-uy) * (1-uz) +
    hash(ix+1, iy,   iz  ) *    ux  * (1-uy) * (1-uz) +
    hash(ix,   iy+1, iz  ) * (1-ux) *    uy  * (1-uz) +
    hash(ix+1, iy+1, iz  ) *    ux  *    uy  * (1-uz) +
    hash(ix,   iy,   iz+1) * (1-ux) * (1-uy) *    uz  +
    hash(ix+1, iy,   iz+1) *    ux  * (1-uy) *    uz  +
    hash(ix,   iy+1, iz+1) * (1-ux) *    uy  *    uz  +
    hash(ix+1, iy+1, iz+1) *    ux  *    uy  *    uz
  );
}

function buildRidgedTerrainFn({ seed = 0, scale = 10, amplitude = 2.7, octaves = 5, lacunarity = 2.95, gain = 0.4, warpStrength = 5.0 } = {}) {
  function warpedNoise(px, py) {
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    const hash = (a, b) => {
      let n = (a + seed) * 374761393 + b * 668265263;
      n = (n ^ (n >>> 13)) * 1274126177;
      n = n ^ (n >>> 16);
      return ((n >>> 0) / 0xffffffff);
    };

    const a = hash(ix,   iy),   b = hash(ix+1, iy);
    const c = hash(ix,   iy+1), d = hash(ix+1, iy+1);

    return {
      val:  a + (b-a)*ux + (c-a)*uy + (a-b-c+d)*ux*uy,
      dfdx: 6*fx*(1-fx) * ((b-a) + (a-b-c+d)*uy),
      dfdy: 6*fy*(1-fy) * ((c-a) + (a-b-c+d)*ux),
    };
  }

  const rotate = (px, py) => [0.80*px - 0.60*py, 0.60*px + 0.80*py];

  return function sampleTerrain(nx, ny, nz) {
    const lon = Math.atan2(nz, nx);
    const lat = Math.asin(Math.max(-1, Math.min(1, ny)));
    let px = lon * scale, py = lat * scale;

    let elevation = 0, octaveAmplitude = 1;
    let amplitudeScale = Math.abs(gain);
    let warpPower = warpStrength;
    let gradX = 0, gradY = 0;

    for (let i = 0; i < octaves; i++) {
      const sample = warpedNoise(px, py);

      gradX += Math.pow(Math.abs(sample.dfdx), warpPower);
      gradY += Math.pow(Math.abs(sample.dfdy), warpPower);
      warpPower = Math.max(1, warpPower - 1);

      const warpDenominator = gradX*gradX + gradY*gradY + 0.85;
      elevation += octaveAmplitude * sample.val / warpDenominator;

      octaveAmplitude *= amplitudeScale;
      amplitudeScale  *= 0.8;

      [px, py] = rotate(px * lacunarity, py * lacunarity);
    }

    const normalizationFactor = smoothstep(1.5, -0.5, elevation) + 0.75;
    return (elevation / normalizationFactor) * amplitude;
  };
}

function buildCombinedHeightFn({
  seed = 0,
  radius = 1,
  continentFrequency = 1.0,
  continentOctaves = 5,
  continentLacunarity = 2.0,
  continentPersistence = 0.5,
  plateauLevel = 0.5,
  continentShapeExponent = 1.5,
  continentHeightFrac = 0.01,
  mountainHeightFrac  = 0.005,
  oceanDepthFrac      = 0.008,
  trenchDepthFrac     = 0.004,
  terrainScale = 20.0,
  terrainOctaves = 5,
  terrainLacunarity = 2.95,
  terrainGain = -0.4,
  terrainWarpStrength = 5.0,
  coastBlendWidth = 0.08,
  seabedFrequency = 2.0,
  seabedOctaves = 4,
  seabedLacunarity = 2.2,
  seabedPersistence = 0.55,
} = {}) {
  const ridgedTerrain = buildRidgedTerrainFn({
    seed,
    scale: terrainScale,
    amplitude: 1.0,
    octaves: terrainOctaves,
    lacunarity: terrainLacunarity,
    gain: terrainGain,
    warpStrength: terrainWarpStrength,
  });

  const continentAmp = radius * continentHeightFrac;
  const mountainAmp  = radius * mountainHeightFrac;
  const oceanAmp     = radius * oceanDepthFrac;
  const trenchAmp    = radius * trenchDepthFrac;

  return function sampleElevation(nx, ny, nz) {
    let continentValue = fbm(
      nx * continentFrequency * 0.5,
      ny * continentFrequency * 0.5,
      nz * continentFrequency * 0.5,
      { octaves: continentOctaves, lacunarity: continentLacunarity, persistence: continentPersistence, seed }
    );
    continentValue = Math.pow((continentValue + 1) * 0.5, continentShapeExponent);

    if (continentValue > plateauLevel) {
      const landBlend = (continentValue - plateauLevel) / (1.0 - plateauLevel);
      const coastMask = smoothstep(plateauLevel, plateauLevel + coastBlendWidth, continentValue);
      return landBlend * continentAmp + ridgedTerrain(nx, ny, nz) * coastMask * mountainAmp;
    }

    const oceanBlend = 1.0 - (continentValue / plateauLevel);
    const oceanShape = oceanBlend * oceanBlend * (3 - 2 * oceanBlend);
    const seabedVariation = fbm(
      nx * seabedFrequency, ny * seabedFrequency, nz * seabedFrequency,
      { octaves: seabedOctaves, lacunarity: seabedLacunarity, persistence: seabedPersistence, seed: seed + 1 }
    );
    return -oceanShape * oceanAmp + seabedVariation * trenchAmp * oceanShape;
  };
}

export const defaultNoiseParams = {
  seed:                  0,
  continentFrequency:    1.0,
  continentOctaves:      5,
  continentLacunarity:   2.0,
  continentPersistence:  0.5,
  plateauLevel:          0.5,
  continentShapeExponent:1.5,
  continentHeightFrac:   0.01,
  mountainHeightFrac:    0.005,
  oceanDepthFrac:        0.05,
  trenchDepthFrac:       0.005,
  coastBlendWidth:       0.08,
  terrainScale:          20.0,
  terrainOctaves:        5,
  terrainLacunarity:     2.95,
  terrainGain:          -0.4,
  terrainWarpStrength:   5.0,
  seabedFrequency:       2.0,
  seabedOctaves:         4,
  seabedLacunarity:      2.2,
  seabedPersistence:     0.55,
};

const heightFnCache = new Map();
function getHeightFn(noiseParams, radius) {
  const cacheKey = JSON.stringify(noiseParams) + `:${radius}`;
  if (!heightFnCache.has(cacheKey)) {
    heightFnCache.set(cacheKey, buildCombinedHeightFn({ ...noiseParams, radius }));
  }
  return heightFnCache.get(cacheKey);
}

// ── Sphere geometry helpers ───────────────────────────────────────────────────

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

function displacedSurfacePoint(sphereDirection, radius, heightFn) {
  const elevation = heightFn(sphereDirection.x, sphereDirection.y, sphereDirection.z);
  return sphereDirection.clone().multiplyScalar(radius + (isFinite(elevation) ? elevation : 0));
}

function computeDisplacedNormal(sphereDirection, radius, heightFn, epsilon = 0.0001) {
  const ref = Math.abs(sphereDirection.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);

  const tangent   = new THREE.Vector3().crossVectors(ref, sphereDirection).normalize();
  const bitangent = new THREE.Vector3().crossVectors(sphereDirection, tangent).normalize();

  const sampleNeighbour = (dt, db) => {
    const neighbourDir = new THREE.Vector3()
      .copy(sphereDirection)
      .addScaledVector(tangent, dt)
      .addScaledVector(bitangent, db)
      .normalize();
    return displacedSurfacePoint(neighbourDir, radius, heightFn);
  };

  const right = sampleNeighbour( epsilon, 0).sub(sampleNeighbour(-epsilon, 0));
  const up    = sampleNeighbour(0,  epsilon).sub(sampleNeighbour(0, -epsilon));

  const normal = new THREE.Vector3().crossVectors(right, up);
  return normal.lengthSq() === 0 ? sphereDirection.clone() : normal.normalize();
}

// ── Occlusion ─────────────────────────────────────────────────────────────────

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

// ── QuadNode ──────────────────────────────────────────────────────────────────

class QuadNode {
  constructor(faceNormal, tangentA, tangentB, tileOffset, tileSize, radius, lodSteps, depth, sphereAmount, noiseParams) {
    this.faceNormal = faceNormal;
    this.tangentA = tangentA;
    this.tangentB = tangentB;
    this.tileOffset = tileOffset;
    this.tileSize = tileSize;
    this.radius = radius;
    this.lodSteps = lodSteps;
    this.depth = depth;
    this.maxDepth = Math.min(lodSteps.dists.length, lodSteps.detail.length - 1);
    this.sphereAmount = sphereAmount;
    this.noiseParams = noiseParams;

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

    const heightFn = getHeightFn(noiseParams, radius);
    this.boundingSphere = new THREE.Sphere().setFromPoints([
      ...this._cornerDirections.map(dir => displacedSurfacePoint(dir, radius, heightFn)),
      displacedSurfacePoint(this._centerDirection, radius, heightFn),
    ]);

    this._tileSurfaceCenter = this._centerDirection.clone().multiplyScalar(radius);
  }

  // topDiv/rightDiv/bottomDiv/leftDiv: segment count on each edge.
  // 1 = no extra vertices; N = N-1 interior vertices added to match finer neighbours.
  _buildGeometry(topDiv, rightDiv, bottomDiv, leftDiv) {
    const { faceNormal, tangentA, tangentB, tileOffset, tileSize, radius, sphereAmount, noiseParams } = this;
    const heightFn = getHeightFn(noiseParams, radius);

    const uMin = tileOffset.x, vMin = tileOffset.y;
    const uMax = uMin + tileSize, vMax = vMin + tileSize;

    // Vertex order: 4 corners, then edge interiors, then one centre vertex.
    const uvCoords = [
      [uMin, vMin], // 0 TL
      [uMax, vMin], // 1 TR
      [uMin, vMax], // 2 BL
      [uMax, vMax], // 3 BR
    ];

    const topIntBase    = uvCoords.length;
    for (let k = 1; k < topDiv;    k++) uvCoords.push([uMin + k * tileSize / topDiv,    vMin]);
    const rightIntBase  = uvCoords.length;
    for (let k = 1; k < rightDiv;  k++) uvCoords.push([uMax, vMin + k * tileSize / rightDiv]);
    const bottomIntBase = uvCoords.length;
    for (let k = 1; k < bottomDiv; k++) uvCoords.push([uMin + k * tileSize / bottomDiv, vMax]);
    const leftIntBase   = uvCoords.length;
    for (let k = 1; k < leftDiv;   k++) uvCoords.push([uMin, vMin + k * tileSize / leftDiv]);
    const centerIdx     = uvCoords.length;
    uvCoords.push([(uMin + uMax) * 0.5, (vMin + vMax) * 0.5]);

    const n         = uvCoords.length;
    const positions = new Float32Array(n * 3);
    const normals   = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      const [u, v]   = uvCoords[i];
      const sphereDir    = cubePointToSphereDirection(faceNormal, tangentA, tangentB, u, v, sphereAmount);
      const elevation    = heightFn(sphereDir.x, sphereDir.y, sphereDir.z);
      const surfacePoint = sphereDir.clone().multiplyScalar(radius + (isFinite(elevation) ? elevation : 0));
      const surfaceNorm  = computeDisplacedNormal(sphereDir, radius, heightFn);

      positions[i * 3]     = surfacePoint.x;
      positions[i * 3 + 1] = surfacePoint.y;
      positions[i * 3 + 2] = surfacePoint.z;
      normals  [i * 3]     = surfaceNorm.x;
      normals  [i * 3 + 1] = surfaceNorm.y;
      normals  [i * 3 + 2] = surfaceNorm.z;
    }

    // Perimeter in CW UV order → outward-facing triangles on the sphere.
    const perimeter = [0]; // TL
    for (let k = 0; k < topDiv    - 1; k++) perimeter.push(topIntBase    + k);
    perimeter.push(1); // TR
    for (let k = 0; k < rightDiv  - 1; k++) perimeter.push(rightIntBase  + k);
    perimeter.push(3); // BR
    for (let k = bottomDiv - 2; k >= 0; k--) perimeter.push(bottomIntBase + k); // right→left
    perimeter.push(2); // BL
    for (let k = leftDiv   - 2; k >= 0; k--) perimeter.push(leftIntBase   + k); // bottom→top

    const indexList = [];
    for (let i = 0; i < perimeter.length; i++) {
      indexList.push(centerIdx, perimeter[i], perimeter[(i + 1) % perimeter.length]);
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexList), 1));
  }

  // Called by the QuadTree stitching pass; rebuilds only when subdivisions change.
  applyStitching(topDiv, rightDiv, bottomDiv, leftDiv) {
    const d = this._edgeDivisions;
    const unchanged = d && d[0] === topDiv && d[1] === rightDiv && d[2] === bottomDiv && d[3] === leftDiv;
    if (unchanged && this.geometry) return; // geometry already up to date
    if (this.geometry) { this.geometry.dispose(); this.geometry = null; }
    this._edgeDivisions = [topDiv, rightDiv, bottomDiv, leftDiv];
    this._buildGeometry(topDiv, rightDiv, bottomDiv, leftDiv);
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
          childTileSize, this.radius, this.lodSteps, childDepth,
          this.sphereAmount, this.noiseParams,
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
    this._frameVisible = -1;
  }

  hasChildren() { return this.children.length > 0; }

  dispose() {
    this.mergeChildren();
    if (this.geometry) { this.geometry.dispose(); this.geometry = null; }
  }
}

// ── QuadTree ──────────────────────────────────────────────────────────────────

class QuadTree {
  constructor(faceNormal, radius, lodSteps, sphereAmount, noiseParams) {
    this.faceNormal = faceNormal;
    this.radius = radius;
    this.lodSteps = lodSteps;
    this.maxDepth = Math.min(lodSteps.dists.length, lodSteps.detail.length - 1);

    const tangentA = new THREE.Vector3(faceNormal.y, faceNormal.z, faceNormal.x);
    const tangentB = new THREE.Vector3().crossVectors(faceNormal, tangentA);

    this._rootNodes = this._buildRootNodes(faceNormal, tangentA, tangentB, radius, lodSteps, sphereAmount, noiseParams);
  }

  _buildRootNodes(faceNormal, tangentA, tangentB, radius, lodSteps, sphereAmount, noiseParams) {
    const rootGridSize = lodSteps.detail[0];
    const rootTileSize = 1.0 / rootGridSize;
    const rootNodes = [];

    for (let row = 0; row < rootGridSize; row++) {
      for (let col = 0; col < rootGridSize; col++) {
        const node = new QuadNode(
          faceNormal, tangentA, tangentB,
          new THREE.Vector2(col * rootTileSize, row * rootTileSize),
          rootTileSize, radius, lodSteps, 0,
          sphereAmount, noiseParams,
        );
        rootNodes.push(node);
      }
    }
    return rootNodes;
  }

  _updateNode(node, cameraLocalPos, frustum, cullContext) {
    // Self-occlusion: cull nodes whose tile center is entirely behind the planet horizon.
    // horizonCos = radius / camDist is the cosine of the angle to the geometric horizon.
    // Subtract a margin based on the node's bounding sphere so limb tiles are never clipped.
    if (cullContext.horizonCos > 0) {
      const margin = node.boundingSphere.radius / cullContext.camDist;
      if (node._centerDirection.dot(cullContext.camDir) < cullContext.horizonCos - margin) {
        node.cullSelf();
        return;
      }
    }

    let shouldSplit = false;
    if (node.depth < this.maxDepth) {
      const distanceToCamera = cameraLocalPos.distanceTo(node.boundingSphere.center);
      if (distanceToCamera === undefined) return;
      shouldSplit = distanceToCamera < this.lodSteps.dists[node.depth];
    }

    if (shouldSplit) {
      node._frameVisible = -1;
      if (!node.hasChildren()) node.splitIntoChildren();
      if (node.geometry) { node.geometry.dispose(); node.geometry = null; }
      for (const child of node.children) this._updateNode(child, cameraLocalPos, frustum, cullContext);
      return;
    }

    if (node.hasChildren()) node.mergeChildren();

    if (!frustum.intersectsSphere(node.boundingSphere)) { node.cullSelf(); return; }

    node._frameVisible = this._frameCounter;
  }

  update(cameraLocalPos, frustum, cullContext) {
    this._frameCounter = (this._frameCounter || 0) + 1;
    for (const rootNode of this._rootNodes) this._updateNode(rootNode, cameraLocalPos, frustum, cullContext);
    this._stitchBoundaries();
  }

  _findLeafAtUV(u, v) {
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    const gridSize = this.lodSteps.detail[0];
    const rootTileSize = 1.0 / gridSize;
    const col = Math.min(gridSize - 1, Math.floor(u / rootTileSize));
    const row = Math.min(gridSize - 1, Math.floor(v / rootTileSize));
    return this._findLeafInSubtree(this._rootNodes[row * gridSize + col], u, v);
  }

  _findLeafInSubtree(node, u, v) {
    if (!node || !node.hasChildren()) return node || null;
    for (const child of node.children) {
      const { x: cu, y: cv } = child.tileOffset;
      if (u >= cu && u < cu + child.tileSize && v >= cv && v < cv + child.tileSize) {
        return this._findLeafInSubtree(child, u, v);
      }
    }
    return node;
  }

  _edgeDivisionsForNode(node, edgeCoord, varMin, varMax, isVertical) {
    // Sample at the midpoint of each sub-segment for the next LOD level.
    // Sampling into an already-split child returns the finest leaf, so multi-level
    // transitions are detected automatically.
    const nextDetail = this.lodSteps.detail[node.depth + 1] || 1;
    const step = (varMax - varMin) / nextDetail;
    let maxDiv = 1;
    for (let k = 0; k < nextDetail; k++) {
      const t = varMin + (k + 0.5) * step;
      const [u, v] = isVertical ? [edgeCoord, t] : [t, edgeCoord];
      const neighbor = this._findLeafAtUV(u, v);
      if (neighbor && neighbor._frameVisible === this._frameCounter && neighbor.tileSize < node.tileSize - 1e-10) {
        const ratio = node.tileSize / neighbor.tileSize;
        if (ratio > 1 && ratio < 64) maxDiv = Math.max(maxDiv, Math.round(ratio));
      }
    }
    return maxDiv;
  }

  _collectVisibleLeaves(node, result) {
    if (!node.hasChildren()) {
      if (node._frameVisible === this._frameCounter) result.push(node);
      return;
    }
    for (const child of node.children) this._collectVisibleLeaves(child, result);
  }

  _stitchBoundaries() {
    const visibleLeaves = [];
    for (const root of this._rootNodes) this._collectVisibleLeaves(root, visibleLeaves);

    for (const node of visibleLeaves) {
      const { tileOffset, tileSize } = node;
      const uMin = tileOffset.x, vMin = tileOffset.y;
      const uMax = uMin + tileSize, vMax = vMin + tileSize;
      const eps  = tileSize * 0.0001;

      const topDiv    = this._edgeDivisionsForNode(node, vMin - eps, uMin, uMax, false);
      const bottomDiv = this._edgeDivisionsForNode(node, vMax + eps, uMin, uMax, false);
      const leftDiv   = this._edgeDivisionsForNode(node, uMin - eps, vMin, vMax, true);
      const rightDiv  = this._edgeDivisionsForNode(node, uMax + eps, vMin, vMax, true);

      node.applyStitching(topDiv, rightDiv, bottomDiv, leftDiv);
    }
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

// ── QuadSphere ────────────────────────────────────────────────────────────────

export default class QuadSphere {
  constructor(
    lodSteps = { dists: [2000000, 20000, 1000, 100], detail: [25, 50, 75, 100] },
    radius = 1,
    sphereAmount = 1,
    noiseParams = defaultNoiseParams,
  ) {
    this.lodSteps = lodSteps;
    this.radius = radius;
    this.sphereAmount = sphereAmount;
    this.noiseParams = { ...defaultNoiseParams, ...noiseParams };

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

    this.quadTrees = faceNormals.map(faceNormal =>
      new QuadTree(faceNormal, radius, lodSteps, sphereAmount, this.noiseParams)
    );

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

    const camDist = cameraLocalPos.length();
    const camDir  = cameraLocalPos.clone().normalize();
    // horizonCos: cos of the angle to the geometric horizon; 0 when camera is inside the sphere
    const horizonCos = camDist > this.radius ? this.radius / camDist : 0;

    const cullContext = { cameraLocalPos, occluders: frameOccluders, camDir, camDist, horizonCos };

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

  rebuildWithParams(noiseParams) {
    this.noiseParams = { ...defaultNoiseParams, ...noiseParams };

    for (const quadTree of this.quadTrees) quadTree.dispose();

    const faceNormals = [
      new THREE.Vector3( 0,  1,  0),
      new THREE.Vector3( 0, -1,  0),
      new THREE.Vector3(-1,  0,  0),
      new THREE.Vector3( 1,  0,  0),
      new THREE.Vector3( 0,  0,  1),
      new THREE.Vector3( 0,  0, -1),
    ];

    this.quadTrees = faceNormals.map(faceNormal =>
      new QuadTree(faceNormal, this.radius, this.lodSteps, this.sphereAmount, this.noiseParams)
    );

    this._rebuildGeometry();
  }

  dispose() {
    for (const quadTree of this.quadTrees) quadTree.dispose();
    this.geometry.dispose();
  }
}
