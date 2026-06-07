"use client"
import React, { useRef} from "react";
import { Canvas} from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Planet from "./objects/planet";
import { AmbientLight, DirectionalLight, GridHelper } from "three";




export function Planets({ className, id }) {
    const canvasRef = useRef(null);   // ← new ref

    return (
        <Canvas
            ref={canvasRef} 
            shadows
            camera={{
                position: [2, 200, 200], // ← starts at -550
                rotation: [-3.0332631463700075, 0, -Math.PI],
                near: 1,
                far: 1.496e22,
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
            <primitive object={new Planet()} />
            
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <OrbitControls />
            <gridHelper args={[100, 100]} position={[0, -1, 0]} />
            <axesHelper args={[100]} position={[0, -1, 0]} />
        </Canvas>
    );
}

export default Planets;