import * as THREE from 'three';

class Planet extends THREE.Mesh{
    constructor(geometry = new THREE.SphereGeometry(20, 32, 32), material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa })){
        super(geometry, material);
    }
}

export default Planet;