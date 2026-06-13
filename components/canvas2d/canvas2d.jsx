"use client"
import React, { useRef, useEffect } from "react";
import { useControls } from "leva";

const ASPECT_RATIO = 2; // equirectangular projection: longitude (360°) x latitude (180°)
const GRID_STEP = 30; // degrees between grid lines

// Cross product of (b - a) and (c - a); sign indicates which side of line ab point c is on
const direction = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const segmentsIntersect = (p1, p2, p3, p4) => {
    const d1 = direction(p3, p4, p1);
    const d2 = direction(p3, p4, p2);
    const d3 = direction(p1, p2, p3);
    const d4 = direction(p1, p2, p4);

    return (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
};

const getIntersection = (p1, p2, p3, p4) => {
    const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
    const denom = d1x * d2y - d1y * d2x;
    if (denom === 0) return null;

    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
    return { x: p1.x + t * d1x, y: p1.y + t * d1y };
};

const hslToRgb = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255),
    ];
};

export function Canvas2D({ className, id }) {
    const canvasRef = useRef(null);

    const { maxSubdivisions } = useControls({
        maxSubdivisions: { value: 20, min: 2, max: 200, step: 1, label: 'Max Subdivisions' },
    });
    const maxSubdivisionsRef = useRef(maxSubdivisions);
    maxSubdivisionsRef.current = maxSubdivisions;

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        let animationFrameId;

        // Position is stored as normalized spherical coordinates:
        // x = longitude / 360 (wraps around, 0..1)
        // y = latitude / 180 (bounces off poles at 0 and 1)
        const dot = {
            x: Math.random(),
            y: Math.random(),
            radius: 4,
        };

        const speed = 0.0025;
        const angleDrift = 0.3;
        const spikeChance = 0.04;
        const spikeDrift = 1.5;
        let angle = Math.atan2(0.001, 0.002);

        // Each segment is a continuous run of points; wrapping/pole crossings start a new segment
        const path = [[{ x: dot.x, y: dot.y }]];

        // The start of the line currently being grown, and whether that start point
        // already touches another line (vs. still being a free, unconnected end)
        let lineStart = { x: dot.x, y: dot.y };
        let lineStartConnected = false;

        // Offscreen layer that accumulates colored-in enclosed regions
        const fillCanvas = document.createElement("canvas");
        const fillCtx = fillCanvas.getContext("2d");

        // Offscreen layer used to rasterize the path as a barrier mask for flood filling
        const maskCanvas = document.createElement("canvas");
        const maskCtx = maskCanvas.getContext("2d");

        const drawGrid = () => {
            ctx.strokeStyle = "#ddd";
            ctx.lineWidth = 1;

            for (let lon = 0; lon <= 360; lon += GRID_STEP) {
                const x = (lon / 360) * canvas.width;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }

            for (let lat = 0; lat <= 180; lat += GRID_STEP) {
                const y = (lat / 180) * canvas.height;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(canvas.width, y);
                ctx.stroke();
            }
        };

        const strokePath = (targetCtx) => {
            targetCtx.strokeStyle = "blue";
            targetCtx.lineWidth = 1;
            path.forEach((segment) => {
                targetCtx.beginPath();
                segment.forEach((point, i) => {
                    const px = point.x * canvas.width;
                    const py = point.y * canvas.height;
                    if (i === 0) targetCtx.moveTo(px, py);
                    else targetCtx.lineTo(px, py);
                });
                targetCtx.stroke();
            });
        };

        const draw = () => {
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            drawGrid();

            ctx.drawImage(fillCanvas, 0, 0);

            strokePath(ctx);

            ctx.beginPath();
            ctx.arc(dot.x * canvas.width, dot.y * canvas.height, dot.radius, 0, Math.PI * 2);
            ctx.fillStyle = "blue";
            ctx.fill();
        };

        // Finds newly enclosed white regions (fully bounded by the path, not touching
        // the canvas edge) and fills each one with its own random color.
        const fillEnclosedRegions = () => {
            const { width, height } = canvas;

            maskCtx.fillStyle = "white";
            maskCtx.fillRect(0, 0, width, height);
            strokePath(maskCtx);

            const maskData = maskCtx.getImageData(0, 0, width, height).data;

            // Recompute every region from scratch each time, so a new line that splits
            // an existing region causes both halves to get fresh, distinct colors
            fillCtx.clearRect(0, 0, width, height);
            const fillImage = fillCtx.getImageData(0, 0, width, height);
            const fillData = fillImage.data;

            const isBarrier = (idx) => {
                const r = maskData[idx * 4];
                const g = maskData[idx * 4 + 1];
                const b = maskData[idx * 4 + 2];
                return !(r > 240 && g > 240 && b > 240);
            };

            const visited = new Uint8Array(width * height);
            const regions = [];

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = y * width + x;
                    if (visited[idx]) continue;
                    if (isBarrier(idx) || fillData[idx * 4 + 3] > 0) {
                        visited[idx] = 1;
                        continue;
                    }

                    const region = [idx];
                    const stack = [idx];
                    visited[idx] = 1;
                    let sumX = x;
                    let sumY = y;

                    while (stack.length) {
                        const cur = stack.pop();
                        const cx = cur % width;
                        const cy = (cur - cx) / width;

                        const neighbors = [
                            [cx + 1, cy],
                            [cx - 1, cy],
                            [cx, cy + 1],
                            [cx, cy - 1],
                        ];

                        for (const [nx, ny] of neighbors) {
                            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                            const nIdx = ny * width + nx;
                            if (visited[nIdx]) continue;
                            visited[nIdx] = 1;
                            if (isBarrier(nIdx) || fillData[nIdx * 4 + 3] > 0) continue;

                            sumX += nx;
                            sumY += ny;
                            region.push(nIdx);
                            stack.push(nIdx);
                        }
                    }

                    // The canvas border acts as a boundary too, so every region gets colored
                    const [r, g, b] = hslToRgb(Math.random() * 360, 0.6, 0.75);
                    region.forEach((rIdx) => {
                        fillData[rIdx * 4] = r;
                        fillData[rIdx * 4 + 1] = g;
                        fillData[rIdx * 4 + 2] = b;
                        fillData[rIdx * 4 + 3] = 255;
                    });

                    regions.push({
                        size: region.length,
                        x: (sumX / region.length) / width,
                        y: (sumY / region.length) / height,
                        pixels: region,
                    });
                }
            }

            fillCtx.putImageData(fillImage, 0, 0);

            return regions;
        };

        const resize = () => {
            let width = window.innerWidth;
            let height = width / ASPECT_RATIO;
            if (height > window.innerHeight) {
                height = window.innerHeight;
                width = height * ASPECT_RATIO;
            }

            canvas.width = width;
            canvas.height = height;
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;

            // Resizing changes pixel coordinates, so previously colored regions can't carry over
            fillCanvas.width = width;
            fillCanvas.height = height;
            maskCanvas.width = width;
            maskCanvas.height = height;

            draw();
        };
        resize();
        window.addEventListener("resize", resize);

        const update = () => {
            const drift = Math.random() < spikeChance ? spikeDrift : angleDrift;
            angle += (Math.random() - 0.5) * drift;

            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            const prev = { x: dot.x, y: dot.y };
            dot.x += vx;
            dot.y += vy;

            let wrapped = false;
            let stop = false;

            // Crossing a pole: reflect latitude and jump longitude by 180°
            if (dot.y < 0) {
                dot.y = -dot.y;
                dot.x += 0.5;
                angle = -angle;
                wrapped = true;
            } else if (dot.y > 1) {
                dot.y = 2 - dot.y;
                dot.x += 0.5;
                angle = -angle;
                wrapped = true;
            }

            // Longitude wraps around continuously
            if (dot.x < 0) {
                dot.x += 1;
                wrapped = true;
            } else if (dot.x >= 1) {
                dot.x -= 1;
                wrapped = true;
            }

            if (!wrapped) {
                // Check whether the new edge crosses any earlier part of the path
                const currentSegment = path[path.length - 1];
                let crossing = null;

                for (let s = 0; s < path.length && !crossing; s++) {
                    const segment = path[s];
                    const isCurrent = segment === currentSegment;
                    const lastIndex = segment.length - 2;

                    for (let i = 0; i < segment.length - 1; i++) {
                        // Skip the edge directly connected to the new edge's start point
                        if (isCurrent && i === lastIndex) continue;
                        if (segmentsIntersect(prev, dot, segment[i], segment[i + 1])) {
                            crossing = { s, i };
                            break;
                        }
                    }
                }

                if (crossing) {
                    const { s, i } = crossing;
                    const intersection = getIntersection(prev, dot, path[s][i], path[s][i + 1]) || prev;

                    // Close the current segment exactly at the crossing point
                    currentSegment.push(intersection);

                    const regions = fillEnclosedRegions();

                    if (regions.length >= maxSubdivisionsRef.current) stop = true;

                    // The intersection end always touches another line by construction.
                    // If the other end of the current line is still free (not touching
                    // any other line), continue growing from there.
                    if (!lineStartConnected) {
                        dot.x = lineStart.x;
                        dot.y = lineStart.y;
                        lineStartConnected = true;
                    } else if (regions.length > 0) {
                        // Both ends are connected; restart near the center of the largest subdivision
                        const largest = regions.reduce((a, b) => (b.size > a.size ? b : a));
                        const targetX = largest.x * canvas.width;
                        const targetY = largest.y * canvas.height;

                        let best = largest.pixels[0];
                        let bestDist = Infinity;
                        for (const pixel of largest.pixels) {
                            const px = pixel % canvas.width;
                            const py = Math.floor(pixel / canvas.width);
                            const dist = (px - targetX) ** 2 + (py - targetY) ** 2;
                            if (dist < bestDist) {
                                bestDist = dist;
                                best = pixel;
                            }
                        }

                        dot.x = (best % canvas.width) / canvas.width;
                        dot.y = Math.floor(best / canvas.width) / canvas.height;

                        lineStart = { x: dot.x, y: dot.y };
                        lineStartConnected = false;
                    }

                    angle = Math.random() * Math.PI * 2;
                    wrapped = true;
                }
            }

            if (wrapped) path.push([]);
            path[path.length - 1].push({ x: dot.x, y: dot.y });

            draw();
            if (!stop) animationFrameId = window.requestAnimationFrame(update);
        };
        animationFrameId = window.requestAnimationFrame(update);

        return () => {
            window.removeEventListener("resize", resize);
            window.cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={className}
            id={id}
            style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: "10",
                backgroundColor: "white",
            }}
        />
    );
}

export default Canvas2D;
