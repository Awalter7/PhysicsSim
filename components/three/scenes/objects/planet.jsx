import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useMemo } from 'react';
import { useControls } from 'leva';
import QuadSphere, { defaultNoiseParams } from '../primitives/quadSphere';
import Line from '../primitives/line';

const PLANET_VERT = /* glsl */`
varying vec3 vWorldPos;
varying vec3 vNormal;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos     = worldPos.xyz;
  vNormal       = normalize(normalMatrix * normal);
  gl_Position   = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PLANET_FRAG = /* glsl */`
uniform float uRadius;
uniform float uMaxElev;     // maximum land elevation
uniform float uMaxDepth;    // maximum ocean depth (positive value)
uniform float uBeachHi;     // how far above sea level the beach extends

uniform vec3 uSandColor;
uniform vec3 uLightDir;

// Land colour stops (low → high)
uniform vec3 uColorLowland;
uniform vec3 uColorGrassland;
uniform vec3 uColorForest;
uniform vec3 uColorRock;
uniform vec3 uColorSnow;

// Ocean colour stops (shallow → deep)
uniform vec3 uColorShallow;
uniform vec3 uColorMid;
uniform vec3 uColorDeep;

varying vec3 vWorldPos;
varying vec3 vNormal;

vec3 terrainGradient(float t) {
  vec3 c = uColorLowland;
  c = mix(c, uColorGrassland, smoothstep(0.00, 0.20, t));
  c = mix(c, uColorForest,    smoothstep(0.20, 0.45, t));
  c = mix(c, uColorRock,      smoothstep(0.45, 0.70, t));
  c = mix(c, uColorSnow,      smoothstep(0.70, 1.00, t));
  return c;
}

vec3 oceanGradient(float t) {
  // t = 0 at surface, 1 at max depth
  vec3 c = uColorShallow;
  c = mix(c, uColorMid,  smoothstep(0.0, 0.4, t));
  c = mix(c, uColorDeep, smoothstep(0.4, 1.0, t));
  return c;
}

void main() {
  float elev = length(vWorldPos) - uRadius;

  vec3 color;

  if (elev < 0.0) {
    // Ocean: depth normalised to [0,1]
    float d = clamp(-elev / uMaxDepth, 0.0, 1.0);
    color = oceanGradient(d);
  } else {
    // Land gradient
    float t = clamp(elev / uMaxElev, 0.0, 1.0);
    color = terrainGradient(t);

    // Beach overrides near sea level
    float beach = 1.0 - smoothstep(0.0, uBeachHi, elev);
    color = mix(color, uSandColor, beach);
  }

  float ndotl = max(0.0, dot(vNormal, uLightDir));
  gl_FragColor = vec4(color * (0.3 + 0.7 * ndotl), 1.0);
}
`;

const Planet = () => {
    const { camera } = useThree();
    const R = 12756000;
    const quadSphere = useRef(new QuadSphere({ dists: [R, R * .25, R * .20, R * .025, R * .015], detail: [50, 2, 2, 4, 5] }, R, 1));
    const meshRef = useRef();

    const planetMaterial = useMemo(() => new THREE.ShaderMaterial({
        vertexShader:   PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        uniforms: {
            uRadius:         { value: R },
            uMaxElev:        { value: R * 0.01  },  // continentHeightFrac = 0.01
            uMaxDepth:       { value: R * 0.05  },  // oceanDepthFrac = 0.05
            uBeachHi:        { value: R * 0.0001 },
            uSandColor:      { value: new THREE.Color('#c9a96e') },
            uColorLowland:   { value: new THREE.Color('#7ec850') },
            uColorGrassland: { value: new THREE.Color('#4a8f3f') },
            uColorForest:    { value: new THREE.Color('#5c6b3a') },
            uColorRock:      { value: new THREE.Color('#7a6652') },
            uColorSnow:      { value: new THREE.Color('#e8edf0') },
            uColorShallow:   { value: new THREE.Color('#1a9dc2') }, // bright turquoise shallows
            uColorMid:       { value: new THREE.Color('#0a5a8a') }, // medium blue
            uColorDeep:      { value: new THREE.Color('#051a3a') }, // deep navy
            uLightDir:       { value: new THREE.Vector3(1, 1, 0.5).normalize() },
        },
    }), []);

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
            meshRef.current.geometry.computeVertexNormals();
            quadSphere.current.update(camera, meshRef.current.matrixWorld);
        }
    });

    return (
        <>
            <Line position={[0, 20, 0]} direction={[1, 0, 0]} length={100} color="red" />
            <Line position={[0, 20, 0]} direction={new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0))} length={100} color="red" />
            <mesh ref={meshRef} geometry={quadSphere.current.geometry} material={planetMaterial} />
        </>
    );
};

export default Planet;
