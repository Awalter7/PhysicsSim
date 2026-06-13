"use client"
import * as THREE from 'three';
import { useRef, useEffect, createContext, useContext, forwardRef, useImperativeHandle } from 'react';
import { useThree, useFrame } from '@react-three/fiber';

// ── Floating-origin orbit controls ──────────────────────────────────────────
// The camera ALWAYS sits at (0, 0, 0) with no translation. Instead of moving
// the camera around a target, we move the *world* (everything passed as
// `children`, wrapped in an internal <group>) by the inverse of where the
// camera "would" be. This keeps the camera's local coordinate space tiny and
// centred at the origin, which is useful for huge scenes (planets, etc.)
// where placing the camera far from the origin causes precision issues.
//
// Usage:
//   <FloatingOrbitControls target={[0,0,0]} radius={R * 2.5}>
//     <Planet />
//   </FloatingOrbitControls>
//
// Anything that needs to know the current world-shift (e.g. to position a
// UI element or a non-grouped object) can call useFloatingOrigin() to get a
// ref to the offset vector (offset = -virtualCameraWorldPosition).

const FloatingOriginContext = createContext(null);

export function useFloatingOrigin() {
  const ctx = useContext(FloatingOriginContext);
  if (!ctx) throw new Error('useFloatingOrigin must be used inside <FloatingOrbitControls>');
  return ctx; // ref to THREE.Vector3
}

// Scratch objects reused every frame to avoid allocations.
const _camOffset  = new THREE.Vector3();
const _camWorldPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _panRight   = new THREE.Vector3();
const _panUp      = new THREE.Vector3();

const FloatingOrbitControls = forwardRef(function FloatingOrbitControls({
  target = [0, 0, 0],
  radius = 10,
  minRadius = 0.000001,
  maxRadius = Infinity,
  azimuth = 0,            // initial horizontal angle (radians)
  polar = Math.PI / 2,    // initial vertical angle (radians), PI/2 = equator
  minPolar = 0.001,
  maxPolar = Math.PI - 0.001,
  rotateSpeed = 1,
  zoomSpeed = 1,
  panSpeed = 1,
  enableRotate = true,
  enableZoom = true,
  enablePan = true,
  enableDamping = true,
  dampingFactor = 0.1,
  children,
}, ref) {
  const { camera, gl } = useThree();

  const targetRef       = useRef(new THREE.Vector3(target[0], target[1], target[2]));
  const sphericalRef    = useRef({ radius, theta: azimuth, phi: polar });
  const sphericalDelta  = useRef({ theta: 0, phi: 0 });
  const panDeltaRef     = useRef(new THREE.Vector3());
  const pointerState    = useRef({ dragging: false, button: 0, x: 0, y: 0 });

  const groupRef  = useRef();
  const offsetRef = useRef(new THREE.Vector3());

  useImperativeHandle(ref, () => ({
    target: targetRef.current,
    spherical: sphericalRef.current,
    offset: offsetRef.current,
    setTarget: (v) => targetRef.current.set(v.x ?? v[0], v.y ?? v[1], v.z ?? v[2]),
  }), []);

  useEffect(() => {
    const dom = gl.domElement;

    const onContextMenu = (e) => e.preventDefault();

    const onPointerDown = (e) => {
      pointerState.current.dragging = true;
      pointerState.current.button = e.button;
      pointerState.current.x = e.clientX;
      pointerState.current.y = e.clientY;
      dom.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
      if (!pointerState.current.dragging) return;
      const dx = e.clientX - pointerState.current.x;
      const dy = e.clientY - pointerState.current.y;
      pointerState.current.x = e.clientX;
      pointerState.current.y = e.clientY;

      const h = dom.clientHeight || 1;
      const isPanButton = pointerState.current.button === 2 || pointerState.current.button === 1;

      if (isPanButton && enablePan) {
        // Pan moves the orbit target along the camera's local right/up axes,
        // scaled by current distance so panning feels consistent at any zoom.
        const panScale = sphericalRef.current.radius * panSpeed / h;
        _panRight.setFromMatrixColumn(camera.matrix, 0);
        _panUp.setFromMatrixColumn(camera.matrix, 1);
        panDeltaRef.current.addScaledVector(_panRight, -dx * panScale);
        panDeltaRef.current.addScaledVector(_panUp,     dy * panScale);
      } else if (enableRotate) {
        sphericalDelta.current.theta -= (2 * Math.PI * dx / h) * rotateSpeed;
        sphericalDelta.current.phi   -= (2 * Math.PI * dy / h) * rotateSpeed;
      }
    };

    const onPointerUp = (e) => {
      pointerState.current.dragging = false;
      dom.releasePointerCapture?.(e.pointerId);
    };

    const onWheel = (e) => {
      if (!enableZoom) return;
      e.preventDefault();
      const scale = Math.pow(0.95, zoomSpeed);
      const sph = sphericalRef.current;
      sph.radius *= (e.deltaY < 0 ? scale : 1 / scale);
      sph.radius = THREE.MathUtils.clamp(sph.radius, minRadius, maxRadius);
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointerleave', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointerleave', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
    };
  }, [gl, camera, rotateSpeed, zoomSpeed, panSpeed, enablePan, enableRotate, enableZoom, minRadius, maxRadius]);

  useFrame(() => {
    const sph   = sphericalRef.current;
    const delta = sphericalDelta.current;

    if (enableDamping) {
      sph.theta += delta.theta * dampingFactor;
      sph.phi   += delta.phi   * dampingFactor;
      delta.theta *= (1 - dampingFactor);
      delta.phi   *= (1 - dampingFactor);
    } else {
      sph.theta += delta.theta;
      sph.phi   += delta.phi;
      delta.theta = 0;
      delta.phi   = 0;
    }

    sph.phi = THREE.MathUtils.clamp(sph.phi, minPolar, maxPolar);

    if (panDeltaRef.current.lengthSq() > 0) {
      targetRef.current.add(panDeltaRef.current);
      panDeltaRef.current.set(0, 0, 0);
    }

    // Spherical → cartesian offset of the (virtual) camera relative to target.
    const sinPhiRadius = Math.sin(sph.phi) * sph.radius;
    _camOffset.set(
      sinPhiRadius * Math.sin(sph.theta),
      Math.cos(sph.phi) * sph.radius,
      sinPhiRadius * Math.cos(sph.theta),
    );

    // Virtual camera world position = target + offset.
    _camWorldPos.copy(targetRef.current).add(_camOffset);

    // Real camera never moves — it stays pinned at the origin.
    camera.position.set(0, 0, 0);
    camera.up.set(0, 1, 0);

    // The target renders at (target - camWorldPos) = -camOffset, so look there.
    _lookTarget.copy(_camOffset).negate();
    camera.lookAt(_lookTarget);

    // Shift the whole world by -camWorldPos so everything appears in the
    // correct place relative to the (stationary) camera.
    offsetRef.current.copy(_camWorldPos).negate();
    if (groupRef.current) groupRef.current.position.copy(offsetRef.current);
  });

  return (
    <FloatingOriginContext.Provider value={offsetRef}>
      <group ref={groupRef}>{children}</group>
    </FloatingOriginContext.Provider>
  );
});

export default FloatingOrbitControls;
