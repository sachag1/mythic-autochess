// Fonctions TSL (shaders de three.js, compilés en WGSL pour WebGPU ou en GLSL pour WebGL2).
// Les types de @types/three pour TSL sont très stricts (types de nœuds imbriqués) et peu
// adaptés aux shaders procéduraux : on les expose ici avec un typage souple.
import * as TSL from "three/tsl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
const T = TSL as unknown as Record<string, Loose>;

export const {
  abs, atan, clamp, cos, dot, exp, float, fract, instancedBufferAttribute, length, max, min, mix, mod, normalView, normalWorld, oneMinus,
  positionLocal, positionViewDirection, positionWorld, PI, PI2, pow, saturate, screenUV, sin, smoothstep, step, texture, time, uniform, uv,
  vec2, vec3, vec4, viewportSharedTexture, mx_noise_float, mx_fractal_noise_float, hash, pass, cameraPosition, normalize, select, sqrt,
} = T;
export type Node = Loose;
