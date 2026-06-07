import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import QuadSphere from '../primitives/quadSphere';
import { buildFaceGeometry } from '../primitives/quadSphere';
import Line from '../primitives/line';

const Planet = () => {
    const { camera } = useThree();
    const quadSphere = useRef(new QuadSphere({ dists: [20, 10, 5, 2, 1], detail: [50, 2, 2, 3, 2] }, 20, 1));
    const meshRef = useRef();

    useFrame(() => {
        if(quadSphere.current && meshRef.current){
            meshRef.current.updateMatrixWorld();
            quadSphere.current.update(camera, meshRef.current.matrixWorld);
        }
    })

    return(
        <>
            <Line position={[0, 20, 0]} direction={[1, 0, 0]} length={100} color="red" />
            <Line position={[0, 20, 0]} direction={new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))} length={100} color="red" />
            <mesh ref={meshRef} geometry={quadSphere.current.geometry}>
                <meshStandardMaterial color={'white'} wireframe={true} />
            </mesh>
        </>
    )
}

export default Planet;














//Use this format later

// const Planet = () => {
//     const geomRef = useRef(new QuadSphere(20, 32));

//     return(
//         <primitive object={new PlanetBase({geometry: geomRef.current.geometry, material: new THREE.MeshStandardMaterial({ color: 0xaaaaaa, wireframe: true })})} />
//     )
// }

// class PlanetBase extends THREE.Mesh{
//     constructor({ geometry = new THREE.SphereGeometry(20, 32, 32), material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa })} = {}){
//         super(geometry, material);
//     }
// }

