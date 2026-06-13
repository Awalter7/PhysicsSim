"use client"
import React, { useRef} from "react";
import { Canvas} from "@react-three/fiber";
import Planet from "./objects/planet";
import FloatingOrbitControls from "./primitives/floatingOrbitControls";
import { useControls, folder } from 'leva';
import Canvas2D from "../../canvas2d/canvas2d";

const R = 12756000;



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
        <Canvas2D className={className} id={id} />
        /* <Canvas
            ref={canvasRef}
            shadows
            camera={{
                position: [0, 0, 0],
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
            {/* Camera stays pinned at (0,0,0); the world moves instead. *}
            <FloatingOrbitControls target={[0, 0, 0]} radius={R * 2.5} minRadius={R} maxRadius={R * 50}>
                <Planet sphereAmount={controls.sphereAmount} />

                {controls.showGrid && <gridHelper args={[100, 100]} position={[0, -1, 0]} />}
                {controls.showAxes && <axesHelper args={[100]} position={[0, -1, 0]} />}

            </FloatingOrbitControls>

            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
        </Canvas> */
    );
}

export default Planets;