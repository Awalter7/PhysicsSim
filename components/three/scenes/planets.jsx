"use client"
import React, { useRef} from "react";
import { Canvas} from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Planet from "./objects/planet";
import { useControls, folder } from 'leva';



export function Planets({ className, id }) {
    const canvasRef = useRef(null);   // ← new ref

    const controls = useControls({
        Helpers: folder(
            {
                showGrid: { value: true, label: 'Show Grid' }, 
                showAxes: { value: true, label: 'Show Axes' },
            },
            { collapsed: true }
        ),
        CubeToSphereDemo: folder(
            {
                sphereAmount: { value: 0, min: 0, max: 1, step: 0.01, label: 'Sphere Amount' },
                showSphere: { value: true, label: 'Show Sphere' },
            },
            { collapsed: true }
        ),
    })


    return (
        <Canvas
            ref={canvasRef} 
            shadows
            camera={{
                position: [0, 0, 12756000 * 2.5],
                near: 1,
                far: 1.496e11,
            }}
            gl={{ antialias: true, logarithmicDepthBuffer: true }} // ← add this
            className={className}
            id={id}
            frameloop="always"
            style={{
                top: 0,
                left: 0,
                width: "100vw",
                height: "100vh",
                zIndex: "10",
                backgroundColor: "black",   
            }}
        >
            <Planet sphereAmount={controls.sphereAmount} />
            
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />

            <OrbitControls />

            {controls.showGrid && <gridHelper args={[100, 100]} position={[0, -1, 0]} />}
            {controls.showAxes && <axesHelper args={[100]} position={[0, -1, 0]} />}
        </Canvas>
    );
}

export default Planets;