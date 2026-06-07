"use client"
import React, { useRef} from "react";
import { Canvas} from "@react-three/fiber";



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
                backgroundColor: "transparent",

        }}
        >

        </Canvas>
    );
}

export default Planets;