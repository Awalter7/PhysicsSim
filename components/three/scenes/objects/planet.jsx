import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import QuadSphere from '../primitives/quadSphere';
import { buildFaceGeometry } from '../primitives/quadSphere';
import Line from '../primitives/line';

const Planet = ({ sphereAmount }) => {
    const geomRef = useRef(new QuadSphere(20, 32, sphereAmount));
    const faceGeom = useRef(buildFaceGeometry(new THREE.Vector3(0, 1, 0), 32, 20, sphereAmount));

    useFrame(() => {
        if(geomRef.current){
            geomRef.current.updateSphereAmount(sphereAmount);
        }
    })

    return(
        <>
            <Line position={[0, 20, 0]} direction={[1, 0, 0]} length={100} color="red" />
            <Line position={[0, 20, 0]} direction={new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))} length={100} color="red" />
            <mesh geometry={faceGeom.current}>
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

