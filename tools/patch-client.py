#!/usr/bin/env python3
"""Transforme l'index.html compilé d'origine en version sécurisée + PWA.
Usage : python3 tools/patch-client.py original/index.html public/index.html"""
import re, sys
src, dst = sys.argv[1], sys.argv[2]
h = open(src, encoding='utf-8').read()

def once(old, new, label):
    global h
    n = h.count(old)
    assert n == 1, f"[{label}] ancre trouvée {n} fois (attendu 1)"
    h = h.replace(old, new)

def swap_function(start, end, new, label):
    global h
    a = h.index(start); b = h.index(end, a)
    assert h.count(start) == 1, label
    h = h[:a] + new + h[b:]

# 1. Jeton Firebase exposé à l'aide-client
once('function H3(){return ni.currentUser}',
     'function H3(){return ni.currentUser}window.__getIdToken=async()=>{if(!ni.currentUser)throw new Error("Non connecté");return ni.currentUser.getIdToken()};', 'token')

# 2. Clés API tierces retirées du navigateur (elles vivent maintenant dans Netlify)
h, n1 = re.subn(r'I4="[0-9a-f]{32}"', 'I4=""', h)
h, n2 = re.subn(r'"[0-9a-f]{64}"', '""', h)   # clé API-Football (présente à plusieurs endroits)
assert n1 == 1 and n2 >= 1, "clés API non trouvées"
assert not re.search(r'"[0-9a-f]{32}"|"[0-9a-f]{64}"', h), "il reste une clé en clair"

# 3. Plus d'appels directs aux API sportives / écriture du cache depuis le navigateur
once('function H4(){', 'function H4(){return!1;', 'H4')
once('async function hf(){', 'async function hf(){return{matches:[],oddsByMatch:{}};', 'hf')
once('async function Q4(){', 'async function Q4(){throw new Error("scores gérés par le serveur");', 'Q4')
once('async function i4(s,e){', 'async function i4(s,e){return;', 'i4')
once('>1800*1e3)return[]', '>7200*1e3)return[]', 'cache-ttl')

# 4. Plus de bonus de 500 000 FCFA à l'inscription
once('balance:5e5,isAdmin:!1', 'balance:0,isAdmin:!1', 'bonus')

# 5. Statut "void" (match annulé / remboursé) reconnu
once('status:s?.status==="won"||s?.status==="lost"?s.status:"pending"',
     'status:s?.status==="won"||s?.status==="lost"||s?.status==="void"?s.status:"pending"', 'u4')

# 6. Pari : validé et débité par le serveur
swap_function('async function c4(', 'function u4(',
 'async function c4(s,e,i){const a=await kt(fe(me,`draftCoupons/${s}/${e}`));if(!a.exists())throw new Error("Brouillon de coupon introuvable.");const c=a.val().picks||[];if(c.length===0)throw new Error("Aucune sélection dans ce coupon.");const r=await window.__vp.api("place-bet",{picks:c.map(E=>({matchId:E.match.id,oddsId:E.odds.oddsId})),stake:Math.round(i)});await On(fe(me,`draftCoupons/${s}/${e}`),null);const b=await qf(s);return{coupon:r.coupon,user:b}}', 'c4')

# 7. Dépôt : Jèko à la place du dépôt manuel
swap_function('async function m4(', 'async function p4(',
 'async function m4(s,e,i,a,o){const q=await window.__vp.choose("Payer "+Number(a).toLocaleString("fr-FR")+" FCFA",!1);if(!q)throw new Error("Paiement annulé.");const r=await window.__vp.api("jeko-create-payment",{amount:Number(a),paymentMethod:q.method});window.location.href=r.redirectUrl;return await new Promise(()=>{})}', 'm4')
once('async function E4(s){', 'async function E4(s){throw new Error("Les dépôts sont désormais crédités automatiquement.");', 'E4')

# 8. Règlement : fait par le serveur (le bouton déclenche seulement le règlement des coupons du joueur)
swap_function('async function M4(', 'function R4(',
 'async function M4(){try{await window.__vp.api("settle-user",{})}catch(e){console.warn(e)}return{resolved:0}}', 'M4')

# 9. Retrait : demande serveur (solde débité côté serveur, versement validé par l'admin)
once('processWithdraw(s,e){return Promise.resolve(q3.processWithdraw(s,e))}',
     'async processWithdraw(s,e){const q=await window.__vp.choose("Retrait de "+Number(e).toLocaleString("fr-FR")+" FCFA",!0);if(!q)throw new Error("Retrait annulé.");const r=await window.__vp.api("request-withdraw",{amount:Number(e),paymentMethod:q.method,phone:q.phone});return r.balance}', 'withdraw')

# 10. Mobile / PWA
once('<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
     '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />\n'
     '    <meta name="theme-color" content="#142436" />\n'
     '    <meta name="mobile-web-app-capable" content="yes" />\n'
     '    <meta name="apple-mobile-web-app-capable" content="yes" />\n'
     '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n'
     '    <meta name="apple-mobile-web-app-title" content="Verroparis" />\n'
     '    <link rel="manifest" href="/manifest.webmanifest" />\n'
     '    <link rel="icon" href="/icon-192.png" />\n'
     '    <link rel="apple-touch-icon" href="/icon-192.png" />\n'
     '    <script src="/vp-helper.js"></script>', 'pwa')

open(dst, 'w', encoding='utf-8').write(h)
print("OK :", dst, len(h), "octets")
