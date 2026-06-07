import * as THREE from "three"

export default function Line({ position = [0, 0, 0], direction = [0, 1, 0], length = 1, color = 'white' }) {
  const start = new THREE.Vector3(...position);
  const end = new THREE.Vector3(...direction).normalize().multiplyScalar(length).add(start);

  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);

  return (
    <primitive object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }))} />
  );
}
