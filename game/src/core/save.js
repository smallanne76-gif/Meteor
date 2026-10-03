// Save system: a single auto-save slot in localStorage written at checkpoints.
const KEY = 'ltlo.save.v1';

export const Save = {
  has() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } },
  read() { try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } },
  write(state) { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, ts: Date.now(), ...state })); return true; } catch (e) { return false; } },
  clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } },
  finished() { try { return localStorage.getItem('ltlo.finished') === '1'; } catch (e) { return false; } },
  markFinished() { try { localStorage.setItem('ltlo.finished', '1'); } catch (e) { /* ignore */ } },
};
