import * as THREE from "three"
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export function buildFaceGeometry(localUp, resolution, radius, sphereAmount = 1) {
  const axisA = new THREE.Vector3(localUp.y, localUp.z, localUp.x); // first tangent direction across the cube face
  const axisB = new THREE.Vector3().crossVectors(localUp, axisA); // third axis perpendicular to both localUp and axisA

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

export default class QuadSphere {
  constructor(radius = 1, resolution = 32, sphereAmount = 1) {
    this.radius = radius;
    this.resolution = resolution;
    this.sphereAmount = sphereAmount;

    const directions = [
      new THREE.Vector3( 0,  1,  0),
      new THREE.Vector3( 0, -1,  0),
      new THREE.Vector3(-1,  0,  0),
      new THREE.Vector3( 1,  0,  0),
      new THREE.Vector3( 0,  0,  1),
      new THREE.Vector3( 0,  0, -1),
    ];

    const faces = directions.map(dir => buildFaceGeometry(dir, resolution, radius, sphereAmount));
    const merged = BufferGeometryUtils.mergeGeometries(faces, false);
    faces.forEach(f => f.dispose());

    merged.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), radius);
    merged.boundingBox = new THREE.Box3(
      new THREE.Vector3(-radius, -radius, -radius),
      new THREE.Vector3( radius,  radius,  radius),
    );

    this.geometry = merged;
  }

  updateSphereAmount(sphereAmount = this.sphereAmount) {
    this.sphereAmount = sphereAmount;

    const directions = [
      new THREE.Vector3( 0,  1,  0),
      new THREE.Vector3( 0, -1,  0),
      new THREE.Vector3(-1,  0,  0),
      new THREE.Vector3( 1,  0,  0),
      new THREE.Vector3( 0,  0,  1),
      new THREE.Vector3( 0,  0, -1),
    ];

    const faces = directions.map(dir => buildFaceGeometry(dir, this.resolution, this.radius, sphereAmount));
    const merged = BufferGeometryUtils.mergeGeometries(faces, false);
    faces.forEach(f => f.dispose());

    this.geometry.dispose();
    this.geometry.copy(merged);
    merged.dispose();
  }

  dispose() {
    this.geometry.dispose();
  }
}
