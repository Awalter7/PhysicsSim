import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect } from 'react';
import { useControls } from 'leva';
import QuadSphere, { defaultNoiseParams } from '../primitives/quadSphere';
import Line from '../primitives/line';

const Planet = () => {
    const { camera } = useThree();
    const quadSphere = useRef(new QuadSphere({ dists: [20, 10, 5, 2, 1], detail: [50, 2, 2, 3, 2] }, 20, 1));
    const meshRef = useRef();

    const noiseControls = useControls('Planet Noise', {
        seed:                   { value: defaultNoiseParams.seed,                   min: 0,    max: 999,  step: 1 },
        continentFrequency:     { value: defaultNoiseParams.continentFrequency,     min: 0.1,  max: 5.0,  step: 0.1 },
        continentOctaves:       { value: defaultNoiseParams.continentOctaves,       min: 1,    max: 12,   step: 1 },
        continentLacunarity:    { value: defaultNoiseParams.continentLacunarity,    min: 1.0,  max: 4.0,  step: 0.1 },
        continentPersistence:   { value: defaultNoiseParams.continentPersistence,   min: 0.1,  max: 1.0,  step: 0.05 },
        continentShapeExponent: { value: defaultNoiseParams.continentShapeExponent, min: 0.1,  max: 5.0,  step: 0.1 },
        plateauLevel:           { value: defaultNoiseParams.plateauLevel,           min: 0.0,  max: 1.0,  step: 0.01 },
        continentHeightFrac:    { value: defaultNoiseParams.continentHeightFrac,    min: 0.0,  max: 0.1,  step: 0.001 },
        mountainHeightFrac:     { value: defaultNoiseParams.mountainHeightFrac,     min: 0.0,  max: 0.05, step: 0.001 },
        coastBlendWidth:        { value: defaultNoiseParams.coastBlendWidth,        min: 0.0,  max: 0.5,  step: 0.01 },
        terrainScale:           { value: defaultNoiseParams.terrainScale,           min: 1.0,  max: 50.0, step: 0.5 },
        terrainOctaves:         { value: defaultNoiseParams.terrainOctaves,         min: 1,    max: 12,   step: 1 },
        terrainLacunarity:      { value: defaultNoiseParams.terrainLacunarity,      min: 1.0,  max: 4.0,  step: 0.05 },
        terrainGain:            { value: defaultNoiseParams.terrainGain,            min: -1.0, max: 1.0,  step: 0.05 },
        terrainWarpStrength:    { value: defaultNoiseParams.terrainWarpStrength,    min: 0.0,  max: 10.0, step: 0.1 },
        oceanDepthFrac:         { value: defaultNoiseParams.oceanDepthFrac,         min: 0.0,  max: 0.1,  step: 0.001 },
        trenchDepthFrac:        { value: defaultNoiseParams.trenchDepthFrac,        min: 0.0,  max: 0.05, step: 0.001 },
        seabedFrequency:        { value: defaultNoiseParams.seabedFrequency,        min: 0.1,  max: 10.0, step: 0.1 },
        seabedOctaves:          { value: defaultNoiseParams.seabedOctaves,          min: 1,    max: 8,    step: 1 },
        seabedLacunarity:       { value: defaultNoiseParams.seabedLacunarity,       min: 1.0,  max: 4.0,  step: 0.1 },
        seabedPersistence:      { value: defaultNoiseParams.seabedPersistence,      min: 0.1,  max: 1.0,  step: 0.05 },
    });

    useEffect(() => {
        quadSphere.current.rebuildWithParams(noiseControls);
    }, [JSON.stringify(noiseControls)]);

    useFrame(() => {
        if (quadSphere.current && meshRef.current) {
            meshRef.current.updateMatrixWorld();
            quadSphere.current.update(camera, meshRef.current.matrixWorld);
        }
    });

    return (
        <>
            <Line position={[0, 20, 0]} direction={[1, 0, 0]} length={100} color="red" />
            <Line position={[0, 20, 0]} direction={new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))} length={100} color="red" />
            <mesh ref={meshRef} geometry={quadSphere.current.geometry}>
                <meshStandardMaterial color={'white'} />
            </mesh>
        </>
    );
};

export default Planet;
