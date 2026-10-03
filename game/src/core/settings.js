// User settings (persisted) + graphics presets.
import { Emitter } from './util.js';

export const PRESETS = {
  LOW: {
    label: 'LOW', shadowEvery: 2, pixelRatio: 0.75, shadows: true, shadowMap: 1024, shadowType: 'basic', msaa: 0, ssao: false, bloom: false, bloomRes: 0.25,
    volumetrics: 0.4, particles: 0.35, drawDistance: 0.55, treeDensity: 0.4, anisotropy: 2, grain: false, chroma: false, dof: false, motionBlur: false,
    reflections: false, maxPointLights: 3, texSize: 'low', foliageShadows: false,
  },
  MEDIUM: {
    label: 'MEDIUM', shadowEvery: 2, pixelRatio: 1, shadows: true, shadowMap: 1024, shadowType: 'pcf', msaa: 0, ssao: false, bloom: true, bloomRes: 0.35,
    volumetrics: 0.6, particles: 0.6, drawDistance: 0.75, treeDensity: 0.65, anisotropy: 4, grain: true, chroma: true, dof: false, motionBlur: false,
    reflections: false, maxPointLights: 4, texSize: 'high', foliageShadows: false,
  },
  HIGH: {
    label: 'HIGH', shadowEvery: 2, pixelRatio: 1, shadows: true, shadowMap: 2048, shadowType: 'pcfsoft', msaa: 4, ssao: true, bloom: true, bloomRes: 0.5,
    volumetrics: 0.85, particles: 0.85, drawDistance: 1, treeDensity: 0.85, anisotropy: 8, grain: true, chroma: true, dof: false, motionBlur: false,
    reflections: true, maxPointLights: 5, texSize: 'high', foliageShadows: true,
  },
  ULTRA: {
    label: 'ULTRA', shadowEvery: 1, pixelRatio: 1, shadows: true, shadowMap: 2048, shadowType: 'pcfsoft', msaa: 4, ssao: true, bloom: true, bloomRes: 0.65,
    volumetrics: 1, particles: 1, drawDistance: 1.25, treeDensity: 1, anisotropy: 16, grain: true, chroma: true, dof: true, motionBlur: true,
    reflections: true, maxPointLights: 6, texSize: 'high', foliageShadows: true,
  },
  CINEMATIC: {
    label: 'CINEMATIC', shadowEvery: 1, pixelRatio: 1.5, shadows: true, shadowMap: 4096, shadowType: 'pcfsoft', msaa: 8, ssao: true, bloom: true, bloomRes: 1,
    volumetrics: 1, particles: 1.4, drawDistance: 1.5, treeDensity: 1.2, anisotropy: 16, grain: true, chroma: true, dof: true, motionBlur: true,
    reflections: true, maxPointLights: 6, texSize: 'high', foliageShadows: true,
  },
};

const DEFAULTS = {
  preset: 'HIGH',
  resolutionScale: 1,
  fov: 72,
  brightness: 1.0,        // gamma-ish multiplier
  mouseSens: 1.0,
  invertY: false,
  motionBlur: true,
  cameraShake: true,
  headBob: true,
  subtitles: true,
  subtitleSize: 1.0,      // 0.8 .. 1.6
  subtitleBackground: true,
  speakerNames: true,
  volMaster: 0.9, volMusic: 0.75, volSfx: 0.9, volAmbience: 0.9, volVoice: 1.0,
  voiceMurmur: true,
  showFps: false,
  contentWarningSeen: false,
  crouchToggle: true,
  reduceFlash: false,     // photosensitivity: no strobing lights / white flashes
};

class Settings extends Emitter {
  constructor() {
    super();
    this.v = { ...DEFAULTS };
    try {
      const raw = localStorage.getItem('ltlo.settings');
      if (raw) Object.assign(this.v, JSON.parse(raw));
    } catch (e) { /* storage may be blocked */ }
    const q = new URLSearchParams(location.search);
    if (q.get('preset') && PRESETS[q.get('preset').toUpperCase()]) this.v.preset = q.get('preset').toUpperCase();
    if (q.get('res')) this.v.resolutionScale = parseFloat(q.get('res'));
    if (!PRESETS[this.v.preset]) this.v.preset = 'HIGH';
  }
  get(k) { return this.v[k]; }
  set(k, val) {
    this.v[k] = val;
    this.save();
    this.emit('change', k, val);
  }
  save() { try { localStorage.setItem('ltlo.settings', JSON.stringify(this.v)); } catch (e) { /* ignore */ } }
  get preset() { return PRESETS[this.v.preset]; }
  reset() { this.v = { ...DEFAULTS }; this.save(); this.emit('change', '*', null); }
}

export const settings = new Settings();
