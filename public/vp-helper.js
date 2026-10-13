/* Aide client : appels serveur authentifiés + sélecteur de moyen de paiement + bannière retour paiement */
(function () {
  var FN = '/.netlify/functions/';
  var METHODS = [['wave', 'Wave'], ['orange', 'Orange Money'], ['mtn', 'MTN MoMo'], ['moov', 'Moov Money'], ['djamo', 'Djamo']];

  async function api(name, body) {
    if (!window.__getIdToken) throw new Error('Application non initialisée');
    var token = await window.__getIdToken();
    var r = await fetch(FN + name, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body || {}) });
    var data = {}; try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error(data.error || 'Erreur serveur (' + r.status + ')');
    return data;
  }

  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text) e.textContent = text; return e; }

  // Renvoie {method, phone} ou null si annulé
  function choose(title, withPhone) {
    return new Promise(function (resolve) {
      var bg = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif');
      var box = el('div', 'background:#142436;color:#fff;width:100%;max-width:440px;border-radius:20px 20px 0 0;padding:20px 20px calc(20px + env(safe-area-inset-bottom));border:1px solid #253952');
      box.appendChild(el('div', 'font-weight:700;font-size:16px;margin-bottom:4px', title));
      box.appendChild(el('div', 'font-size:12px;color:#8B95A3;margin-bottom:14px', 'Choisissez votre moyen de paiement'));
      var selected = null, btns = [];
      var grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px');
      METHODS.forEach(function (m) {
        var b = el('button', 'padding:12px;border-radius:12px;border:1px solid #253952;background:#0E1B2B;color:#fff;font-weight:600;font-size:13px;cursor:pointer', m[1]);
        b.onclick = function () { selected = m[0]; btns.forEach(function (x) { x.style.borderColor = '#253952'; }); b.style.borderColor = '#10b981'; };
        btns.push(b); grid.appendChild(b);
      });
      box.appendChild(grid);
      var phone = null;
      if (withPhone) {
        phone = el('input', 'width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #253952;background:#0E1B2B;color:#fff;font-size:14px;margin-bottom:12px');
        phone.type = 'tel'; phone.placeholder = 'Numéro de réception (ex. 07 01 02 03 04)';
        box.appendChild(phone);
      }
      var err = el('div', 'color:#ff6b6b;font-size:12px;min-height:16px;margin-bottom:8px');
      box.appendChild(err);
      var row = el('div', 'display:flex;gap:8px');
      var cancel = el('button', 'flex:1;padding:12px;border-radius:12px;border:1px solid #253952;background:transparent;color:#fff;font-weight:600;cursor:pointer', 'Annuler');
      var ok = el('button', 'flex:2;padding:12px;border-radius:12px;border:0;background:#10b981;color:#fff;font-weight:700;cursor:pointer', 'Continuer');
      function close(v) { document.body.removeChild(bg); resolve(v); }
      cancel.onclick = function () { close(null); };
      ok.onclick = function () {
        if (!selected) { err.textContent = 'Choisissez un moyen de paiement.'; return; }
        if (withPhone && !/^\+?\d{8,15}$/.test(phone.value.replace(/[\s.-]/g, ''))) { err.textContent = 'Numéro de téléphone invalide.'; return; }
        close({ method: selected, phone: phone ? phone.value : '' });
      };
      row.appendChild(cancel); row.appendChild(ok); box.appendChild(row); bg.appendChild(box); document.body.appendChild(bg);
    });
  }

  window.__vp = { api: api, choose: choose };

  // Retour de Jèko
  document.addEventListener('DOMContentLoaded', function () {
    var q = new URLSearchParams(location.search), d = q.get('deposit');
    if (!d) return;
    var msg = d === 'success' ? 'Paiement reçu. Votre solde sera mis à jour dans quelques instants.' : 'Paiement annulé ou échoué.';
    var b = el('div', 'position:fixed;top:env(safe-area-inset-top);left:0;right:0;z-index:99999;padding:12px 16px;text-align:center;font:600 13px system-ui;color:#fff;background:' + (d === 'success' ? '#059669' : '#b45309'), msg);
    b.onclick = function () { b.remove(); };
    document.body.appendChild(b);
    setTimeout(function () { b.remove(); }, 12000);
    history.replaceState({}, '', location.pathname);
  });

  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
})();
