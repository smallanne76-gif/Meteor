// The title: the lodge on its hill, snow coming down, the porch light on. A very slow push-in. Now and then, far off, a lantern.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class TitlePhase {
  constructor(world) { this.w = world; this.g = world.game; this.disposed = false; this.t = 0; this.lanternT = 22; }
  async start() {
    const w = this.w, g = this.g, D = g.director, S = w.searcher;
    g.flags.phase = 'title'; w.zones = { lodge: true, yardOnly: false, road: true, trail: true, boathouse: false, lake: false, deck: false };
    w.snowLevel = 1; w.baseFear = 0; w.outsideAmb = 'winterNight'; w.inCar = false; g.indoorTarget = 0;
    g.setSky('nightSnow'); g.setGrade('nightSnow', true); g.gfx.fx.fade = 0; g.gfx.fx.eyes = 0; g.gfx.fx.dread = 0; g.gfx.fx.cold = 0; g.gfx.fx.dof = 0;
    S.vanish(); w.porch.set(true);
    g.audio.amb.set('winterNight', { fade: 4 }); g.audio.music.stopAll && g.audio.music.stopAll(1); g.audio.music.titleBox && g.audio.music.titleBox();
    g.hands.setVisible(false);
    D.take({ pos: V(10.4, 1.7, 46), look: V(-5.5, 2.4, 6), fov: 44, handheld: 0.08, bars: false, dof: 0, hideHands: true, mode: 'title' });
    D.move({ pos: V(6.5, 1.65, 30), look: V(-4.2, 2.6, 5), fov: 42, dur: 240 });
    g.mode = 'title';
  }
  update(dt) {
    const w = this.w, g = this.g, S = w.searcher; this.t += dt;
    if (this.t > this.lanternT && S.state === 'absent') {
      // far across the field, a lantern crosses between the trees and is gone
      const pts = [[-16, 14], [-13, 10], [-12, 4], [-14, -2]];
      S.setPos(-19, 0, 16, Math.PI * 0.5); S.setLantern(true); S.show(true); S.opts.noHunt = true; S.callT = 99;
      S.scriptWalk(pts, { speed: 0.9 }).then(() => { S.vanish(); this.lanternT = this.t + 55 + Math.random() * 40; });
    }
  }
  dispose() { this.disposed = true; this.g.director.active && this.g.director.release({ keepBars: false }); }
}
