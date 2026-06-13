import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useEffect, useMemo } from 'react';
import { useControls } from 'leva';
import QuadSphere, { defaultNoiseParams } from '../primitives/quadSphere';
import Line from '../primitives/line';

const PLANET_VERT = /* glsl */`
varying vec3 vLocalPos;
varying vec3 vNormal;
varying vec3 vViewPos;

void main() {
  // Use object-space position for elevation: with the floating-origin camera
  // the mesh's modelMatrix carries a huge translation, so world-space length()
  // no longer measures distance from the planet's centre. Object space is
  // always centred on the planet, regardless of where the world is shifted.
  vLocalPos   = position;
  vNormal     = normalize(mat3(modelMatrix) * normal); // world-space direction (rotation only)

  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vViewPos = viewPos.xyz;
  gl_Position = projectionMatrix * viewPos;
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

// Distance fog/haze: fades the surface toward uFogColor between
// uFogStart and uFogEnd (distance from the camera, in world units).
uniform float uFogStart;
uniform float uFogEnd;
uniform vec3 uFogColor;

varying vec3 vLocalPos;
varying vec3 vNormal;
varying vec3 vViewPos;

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
  float elev = length(vLocalPos) - uRadius;

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
  color *= (0.3 + 0.7 * ndotl);

  // Fade toward the fog/haze colour with distance from the camera.
  float camDist = length(vViewPos);
  float fog = smoothstep(uFogStart, uFogEnd, camDist);
  color = mix(color, uFogColor, fog);

  gl_FragColor = vec4(color, 1.0);
}
`;

const Planet = () => {
    const { camera } = useThree();
    const R = 12756000;
    const quadSphere = useRef(new QuadSphere({ dists: [R, R * .25, R * .20, R * .025, R * .015, R * .01, R * .001, R * .0001], detail: [50, 2, 4, 2, 3, 2, 5] }, R, 1));
    const meshRef = useRef();

    const planetMaterial = useMemo(() => new THREE.ShaderMaterial({
        vertexShader:   PLANET_VERT,
        fragmentShader: PLANET_FRAG,
        uniforms: {
            uRadius:         { value: R },
            uMaxElev:        { value: R * 0.0012 },  // ~ mountainHeightFrac
            uMaxDepth:       { value: R * 0.0012 },  // ~ trenchDepthFrac
            uBeachHi:        { value: R * 0.00002 },
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
            uFogStart:       { value: R * 5 },
            uFogEnd:         { value: R * 15 },
            uFogColor:       { value: new THREE.Color('#0a0e1a') },
        },
    }), []);

    const noiseControls = useControls('Planet Noise', {
        seed:                   { value: defaultNoiseParams.seed,                   min: 0,     max: 999,  step: 1 },
        plateCount:             { value: defaultNoiseParams.plateCount,             min: 3,     max: 30,   step: 1,     label: 'Plate Count' },
        continentalFraction:    { value: defaultNoiseParams.continentalFraction,    min: 0.0,   max: 1.0,  step: 0.05,  label: 'Continental Fraction' },
        continentHeightFrac:    { value: defaultNoiseParams.continentHeightFrac,    min: 0.0,    max: 0.003, step: 0.00005, label: 'Continent Height' },
        continentVariationFrac: { value: defaultNoiseParams.continentVariationFrac, min: 0.0,    max: 0.001, step: 0.00002, label: 'Continent Variation' },
        oceanFloorFrac:         { value: defaultNoiseParams.oceanFloorFrac,         min: 0.0,    max: 0.003, step: 0.00005, label: 'Ocean Floor Depth' },
        oceanVariationFrac:     { value: defaultNoiseParams.oceanVariationFrac,     min: 0.0,    max: 0.001, step: 0.00002, label: 'Ocean Variation' },
        mountainHeightFrac:     { value: defaultNoiseParams.mountainHeightFrac,     min: 0.0,    max: 0.003, step: 0.00005, label: 'Mountain Height' },
        trenchDepthFrac:        { value: defaultNoiseParams.trenchDepthFrac,        min: 0.0,    max: 0.003, step: 0.00005, label: 'Trench Depth' },
        ridgeHeightFrac:        { value: defaultNoiseParams.ridgeHeightFrac,        min: 0.0,    max: 0.001, step: 0.00002, label: 'Mid-Ocean Ridge Height' },
        riftDepthFrac:          { value: defaultNoiseParams.riftDepthFrac,          min: 0.0,    max: 0.001, step: 0.00002, label: 'Rift Valley Depth' },
        boundaryWidth:          { value: defaultNoiseParams.boundaryWidth,          min: 0.005,  max: 0.2,   step: 0.005,   label: 'Boundary Width' },
        convergentThreshold:    { value: defaultNoiseParams.convergentThreshold,    min: 0.0,    max: 1.0,   step: 0.01,    label: 'Convergent Threshold' },
        seamountHeightFrac:     { value: defaultNoiseParams.seamountHeightFrac,     min: 0.0,    max: 0.002, step: 0.00005, label: 'Seamount Height' },
        seamountFrequency:      { value: defaultNoiseParams.seamountFrequency,      min: 0.5,    max: 20.0,  step: 0.5,     label: 'Seamount Frequency' },
        seamountSharpness:      { value: defaultNoiseParams.seamountSharpness,      min: 1.0,    max: 12.0,  step: 0.5,     label: 'Seamount Sharpness' },
        terrainScale:           { value: defaultNoiseParams.terrainScale,           min: 1.0,    max: 50.0,  step: 0.5,     label: 'Terrain Scale' },
        terrainOctaves:         { value: defaultNoiseParams.terrainOctaves,         min: 1,      max: 12,    step: 1,       label: 'Terrain Octaves' },
        terrainLacunarity:      { value: defaultNoiseParams.terrainLacunarity,      min: 1.0,    max: 4.0,   step: 0.05,    label: 'Terrain Lacunarity' },
        terrainGain:            { value: defaultNoiseParams.terrainGain,            min: -1.0,   max: 1.0,   step: 0.05,    label: 'Terrain Gain' },
        terrainWarpStrength:    { value: defaultNoiseParams.terrainWarpStrength,    min: 0.0,    max: 10.0,  step: 0.1,     label: 'Terrain Warp Strength' },
        fineDetailFrac:         { value: defaultNoiseParams.fineDetailFrac,         min: 0.0,    max: 0.0005,step: 0.000005,label: 'Fine Detail' },
    });

    useEffect(() => {
        quadSphere.current.rebuildWithParams(noiseControls);
    }, [JSON.stringify(noiseControls)]);

    const fogControls = useControls('Planet Fog', {
        fogStart: { value: R * 5,  min: 0, max: R * 50, step: R * 0.1, label: 'Fog Start (dist)' },
        fogEnd:   { value: R * 15, min: 0, max: R * 50, step: R * 0.1, label: 'Fog End (dist)' },
        fogColor: { value: '#0a0e1a', label: 'Fog Color' },
    });

    useEffect(() => {
        const u = planetMaterial.uniforms;
        u.uFogStart.value = fogControls.fogStart;
        u.uFogEnd.value   = fogControls.fogEnd;
        u.uFogColor.value.set(fogControls.fogColor);
    }, [fogControls.fogStart, fogControls.fogEnd, fogControls.fogColor]);

    useFrame(() => {
        if (quadSphere.current && meshRef.current) {
            // Walk up and refresh ancestor matrices first (the floating-origin
            // group's position changes every frame), then this mesh's own.
            meshRef.current.updateWorldMatrix(true, false);
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
