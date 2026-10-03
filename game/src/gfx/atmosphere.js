// Global atmospheric fog: replaces three's fog chunks with an exponential *height* fog that also scatters
// sun / moon light toward the viewer. Every fogged material in the game gets it automatically.
import * as THREE from 'three';

export const atmo = {
  uViewInv: { value: new THREE.Matrix4() },
  uFogBase: { value: 0.0 },        // world height where fog density is `fogDensity`
  uFogFalloff: { value: 0.045 },   // per-metre density decay with height
  uScatterDir: { value: new THREE.Vector3(0, 1, 0) },  // view-space direction TOWARD the light
  uScatterCol: { value: new THREE.Color(0, 0, 0) },
  uScatterPow: { value: 6.0 },
  uFogNoise: { value: 0.0 },
};

let installed = false;
export function installAtmosphere() {
  if (installed) return; installed = true;

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
  varying float vFogWY;
  uniform mat4 uViewInv;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
  vFogWY = ( uViewInv * mvPosition ).y;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogView;
  varying float vFogWY;
  uniform mat4 uViewInv;
  uniform float fogDensity;
  uniform float uFogBase, uFogFalloff, uScatterPow;
  uniform vec3 uScatterDir, uScatterCol;
  vec3 applyHeightFog( vec3 col ) {
    float dist = length( vFogView );
    float camY = uViewInv[3].y;
    float dy = vFogWY - camY;
    float k = uFogFalloff;
    float d0 = exp( - k * ( camY - uFogBase ) );
    float t = abs( k * dy ) > 1e-3 ? ( 1.0 - exp( - k * dy ) ) / ( k * dy ) : 1.0;
    float od = fogDensity * d0 * dist * t;
    float f = 1.0 - exp( - od * od * 0.6 - od * 0.6 );   // slightly steeper than pure exp: reads as "thicker air"
    vec3 v = normalize( vFogView );
    float s = pow( max( dot( v, uScatterDir ), 0.0 ), uScatterPow );
    vec3 fc = fogColor + uScatterCol * s;
    return mix( col, fc, clamp( f, 0.0, 1.0 ) );
  }
#endif`;
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  gl_FragColor.rgb = applyHeightFog( gl_FragColor.rgb );
#endif`;

  // hook every material so the shared uniforms are bound. Materials that assign their own onBeforeCompile
  // must call bindAtmo(shader) themselves (see gfx/materials.js `patch`).
  THREE.Material.prototype.onBeforeCompile = function (shader) { bindAtmo(shader); };
}

export function bindAtmo(shader) {
  if (shader.vertexShader.includes('uViewInv') || shader.fragmentShader.includes('uViewInv')) {
    shader.uniforms.uViewInv = atmo.uViewInv;
    shader.uniforms.uFogBase = atmo.uFogBase;
    shader.uniforms.uFogFalloff = atmo.uFogFalloff;
    shader.uniforms.uScatterDir = atmo.uScatterDir;
    shader.uniforms.uScatterCol = atmo.uScatterCol;
    shader.uniforms.uScatterPow = atmo.uScatterPow;
  }
}

/** call each frame */
export function updateAtmosphere(camera, scatterWorldDir) {
  atmo.uViewInv.value.copy(camera.matrixWorld);
  atmo.uScatterDir.value.copy(scatterWorldDir).transformDirection(camera.matrixWorldInverse);
}

/** For ShaderMaterials that opt into fog (fog:true): add these uniforms. */
export function fogUniforms() {
  return {
    uViewInv: atmo.uViewInv, uFogBase: atmo.uFogBase, uFogFalloff: atmo.uFogFalloff,
    uScatterDir: atmo.uScatterDir, uScatterCol: atmo.uScatterCol, uScatterPow: atmo.uScatterPow,
  };
}
