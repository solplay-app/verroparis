const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
class Snap { constructor(v) { this.v = v; } val() { return this.v === undefined ? null : clone(this.v); } exists() { return this.v !== undefined && this.v !== null; } }
let n = 0;
function makeDb() {
  let root = {};
  const parts = (p) => p.split('/').filter(Boolean);
  const get = (p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), root);
  const set = (p, val) => {
    const ks = parts(p); if (!ks.length) { root = clone(val) || {}; return; }
    let o = root; for (const k of ks.slice(0, -1)) { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; }
    const last = ks[ks.length - 1];
    if (val === null || val === undefined) delete o[last]; else o[last] = clone(val);
  };
  const ref = (path = '') => ({
    key: parts(path).pop(),
    child: (c) => ref(`${path}/${c}`),
    once: async () => new Snap(get(path)),
    set: async (v) => set(path, v),
    update: async (obj) => { for (const [k, v] of Object.entries(obj)) set(`${path}/${k}`, v); },
    push: () => ref(`${path}/k${String(++n).padStart(6, '0')}`),
    transaction: async (fn) => {
      const cur = get(path); const res = fn(cur === undefined ? null : clone(cur));
      if (res === undefined) return { committed: false, snapshot: new Snap(cur) };
      set(path, res); return { committed: true, snapshot: new Snap(res) };
    },
    orderByChild: (c) => ({ equalTo: (v) => ({ once: async () => {
      const o = get(path) || {}, out = {};
      for (const [k, x] of Object.entries(o)) if (x && x[c] === v) out[k] = x;
      return new Snap(Object.keys(out).length ? out : undefined);
    } }) }),
  });
  return { ref, _get: get, _set: set };
}
module.exports = { makeDb };
