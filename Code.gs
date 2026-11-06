/*******************************************************
 *  KILLBOT · Cluedo espacial · Futurmovil  (v1.0)
 *  API JSON para la web de GitHub Pages (puntofibra.github.io/killbot)
 *  - Login del anfitrión: correo + contraseña o Google
 *  - Los invitados entran sin cuenta con el código / QR de la sala
 *  - Partidas en tiempo real (CacheService + LockService)
 *  - Panel admin oculto: llave NFC, QR para el ordenador o Google Authenticator
 *  Implementar > Aplicación web > Ejecutar como: Yo · Acceso: Cualquier usuario
 *******************************************************/

var APP_NAME = 'KILLBOT';
var SHEET_ID = '1z-61AnV7CA2w8E64MpvobDS7tt-wM4oC5UN1iPTfTpo';
var PUBLIC_BASE_URL = 'https://puntofibra.github.io/killbot/';
var ADMIN_EMAIL = 'futurmovil.com@gmail.com';
var GOOGLE_CLIENT_ID = '454055120059-nuhaop4r62urc3u036cc3grpqo71ulg7.apps.googleusercontent.com';

var AJUSTES_DEF = {
  tRefutar: 45,        // segundos para enseñar carta antes de que se elija sola
  botMs: 1900,         // pausa de los bots entre acciones (ms)
  bots: true,          // permitir añadir bots
  maxJug: 9,           // máximo de jugadores por sala
  mant: false,         // modo mantenimiento (no se pueden crear partidas)
  mantMsg: 'Estamos mejorando la nave. Vuelve en un rato.',
  banner: '',          // aviso que sale en el menú
  imgVer: 1,           // súbelo para forzar que se recarguen las imágenes
  intro: 'Lucas ha sido desconectado a bordo de la KB-9. El asesino está entre la tripulación… ¡Descúbrelo!'
};

/* ═════════════════ ENTRADA ═════════════════ */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.accion) return responder_(manejar_(p), p.callback);
  return HtmlService.createHtmlOutput('<meta http-equiv="refresh" content="0;url=' + PUBLIC_BASE_URL + '">KILLBOT');
}
function doPost(e) {
  var p = {};
  try { p = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { }
  return responder_(manejar_(p));
}
function responder_(out, cb) {
  var j = JSON.stringify(out);
  if (cb && /^[\w.]+$/.test(cb)) return ContentService.createTextOutput(cb + '(' + j + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(j).setMimeType(ContentService.MimeType.JSON);
}

function manejar_(p) {
  try {
    var a = String(p.accion || '');
    var r;
    switch (a) {
      /* cuentas */
      case 'config':      r = { cfg: cfgPub_() }; break;
      case 'registro':    r = registrar_(p); break;
      case 'entrar':      r = entrar_(p); break;
      case 'google':      r = google_(p); break;
      case 'yo':          r = { user: pubUser_(sesion_(p.ses)) }; break;
      case 'salir':       r = salir_(p); break;
      case 'recuperar':   r = recuperar_(p); break;
      case 'restablecer': r = restablecer_(p); break;
      /* sala */
      case 'crear':       var u = sesion_(p.ses); r = crearSala(p.modo, u.nombre, u); break;
      case 'unirse':      r = unirse(p.code, p.nombre); break;
      case 'elegir':      r = elegirPersonaje(p.code, p.tk, p.sus); break;
      case 'nombre':      r = cambiarNombre(p.code, p.tk, p.nombre); break;
      case 'bot':         r = addBot(p.code, p.tk); break;
      case 'quitar':      r = quitarJugador(p.code, p.tk, p.pid); break;
      case 'empezar':     r = empezar(p.code, p.tk); break;
      case 'estado':      r = estado(p.code, p.tk, p.ver); break;
      case 'jugar':       r = accion(p.code, p.tk, p.act, p.d, p.aid); break;
      case 'reiniciar':   r = reiniciar(p.code, p.tk); break;
      /* admin */
      case 'admLlave':    r = adminLlave_(p); break;
      case 'admTotp':     r = adminTotp_(p); break;
      case 'admQr':       r = adminQr_(); break;
      case 'admQrEstado': r = adminQrEstado_(p); break;
      case 'admAutorizar':r = adminAutorizar_(p); break;
      case 'adm':         r = admin_(p); break;
      default: throw new Error('Acción desconocida');
    }
    r = r || {};
    if (r.ok === undefined) r.ok = true;
    return r;
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).replace(/^Error:\s*/, '') };
  }
}

/* ═════════════════ AJUSTES / CARTAS ═════════════════ */

var CFG_ = null;
function cfg_() {
  if (CFG_) return CFG_;
  var raw = PropertiesService.getScriptProperties().getProperty('cfg');
  var c = {}; try { c = JSON.parse(raw || '{}'); } catch (e) { }
  c.ajustes = Object.assign({}, AJUSTES_DEF, c.ajustes || {});
  c.cartas = c.cartas || {};
  CFG_ = c; return c;
}
function guardaCfg_(c) { PropertiesService.getScriptProperties().setProperty('cfg', JSON.stringify({ ajustes: c.ajustes, cartas: c.cartas })); CFG_ = null; }
function aj_(k) { return cfg_().ajustes[k]; }
function cfgPub_() {
  var c = cfg_(), a = c.ajustes;
  return { banner: a.banner, mant: a.mant, mantMsg: a.mantMsg, imgVer: a.imgVer, intro: a.intro, bots: a.bots, tRefutar: a.tRefutar, cartas: c.cartas };
}
function nm_(id) { var o = cfg_().cartas[id]; return (o && o.n) || NM[id] || id; }

/* ═════════════════ USUARIOS (anfitriones) ═════════════════ */

var U = { Id: 0, Email: 1, Nombre: 2, Hash: 3, Sal: 4, Google: 5, Creado: 6, Ultimo: 7, Partidas: 8, Bloqueado: 9, Tokens: 10 };
var U_CAB = ['Id', 'Email', 'Nombre', 'Hash', 'Sal', 'Google', 'Creado', 'Último acceso', 'Partidas', 'Bloqueado', 'Sesiones'];

function ss_() { return SpreadsheetApp.openById(SHEET_ID); }
function hoja_(nombre, cab) {
  var ss = ss_(), sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.appendRow(cab); sh.getRange(1, 1, 1, cab.length).setFontWeight('bold').setBackground('#0b1328').setFontColor('#22e4ff');
    sh.setFrozenRows(1);
  }
  return sh;
}
function usuarios_() {
  var sh = hoja_('Usuarios', U_CAB);
  var n = sh.getLastRow();
  var rows = n > 1 ? sh.getRange(2, 1, n - 1, U_CAB.length).getValues() : [];
  return { sh: sh, rows: rows };
}
function guardaFila_(sh, i, row) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); }
function buscar_(rows, col, v) { for (var i = 0; i < rows.length; i++) if (String(rows[i][col]).toLowerCase() === String(v).toLowerCase()) return i; return -1; }
function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function limpiaEmail_(e) { return String(e || '').trim().toLowerCase(); }
function emailOk_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function freno_(clave, max, seg) {
  var c = CacheService.getScriptCache(), k = 'fr_' + clave, n = Number(c.get(k) || 0);
  if (n >= max) throw new Error('Demasiados intentos. Espera unos minutos.');
  c.put(k, String(n + 1), seg);
}
function lockU_(fn) { var l = LockService.getScriptLock(); l.waitLock(15000); try { return fn(); } finally { l.releaseLock(); } }

function nuevaSesion_(sh, i, row) {
  var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8);
  var list = []; try { list = JSON.parse(row[U.Tokens] || '[]'); } catch (e) { }
  list.push(t); if (list.length > 6) list = list.slice(-6);
  row[U.Tokens] = JSON.stringify(list);
  row[U.Ultimo] = new Date();
  guardaFila_(sh, i, row);
  CacheService.getScriptCache().put('ses_' + t, row[U.Email], 21600);
  return { ses: t, user: pubUser_(userObj_(row)) };
}
function userObj_(row) {
  return { email: row[U.Email], nombre: row[U.Nombre], partidas: Number(row[U.Partidas] || 0), bloqueado: !!row[U.Bloqueado] };
}
function pubUser_(u) { return { email: u.email, nombre: u.nombre, partidas: u.partidas, admin: u.email === ADMIN_EMAIL }; }

function sesion_(t) {
  t = String(t || '');
  if (t.length < 20) throw new Error('Inicia sesión para crear una partida');
  var email = CacheService.getScriptCache().get('ses_' + t);
  var f = usuarios_(), i = -1;
  if (email) i = buscar_(f.rows, U.Email, email);
  if (i < 0) {
    for (var k = 0; k < f.rows.length; k++) { if (String(f.rows[k][U.Tokens] || '').indexOf(t) >= 0) { i = k; break; } }
    if (i < 0) throw new Error('SESION');
    CacheService.getScriptCache().put('ses_' + t, f.rows[i][U.Email], 21600);
  }
  var u = userObj_(f.rows[i]);
  if (u.bloqueado) throw new Error('Tu cuenta está bloqueada');
  u.fila = i;
  return u;
}

function registrar_(p) {
  var email = limpiaEmail_(p.email), nombre = String(p.nombre || '').replace(/[<>]/g, '').trim().slice(0, 16), pass = String(p.pass || '');
  if (!emailOk_(email)) throw new Error('Correo no válido');
  if (nombre.length < 2) throw new Error('Pon tu nombre');
  if (pass.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  freno_('reg', 30, 3600);
  return lockU_(function () {
    var f = usuarios_();
    if (buscar_(f.rows, U.Email, email) >= 0) throw new Error('Ya hay una cuenta con ese correo. Entra o recupera tu contraseña.');
    var sal = Utilities.getUuid();
    var row = ['U' + Date.now().toString(36), email, nombre, sha_(sal + pass), sal, '', new Date(), new Date(), 0, '', '[]'];
    f.sh.appendRow(row);
    return nuevaSesion_(f.sh, f.rows.length, row);
  });
}
function entrar_(p) {
  var email = limpiaEmail_(p.email), pass = String(p.pass || '');
  freno_('in_' + email, 10, 900);
  return lockU_(function () {
    var f = usuarios_(), i = buscar_(f.rows, U.Email, email);
    if (i < 0) throw new Error('No hay ninguna cuenta con ese correo');
    var row = f.rows[i];
    if (!row[U.Hash]) throw new Error('Esta cuenta se creó con Google: usa el botón de Google o recupera la contraseña');
    if (sha_(row[U.Sal] + pass) !== row[U.Hash]) throw new Error('Contraseña incorrecta');
    if (row[U.Bloqueado]) throw new Error('Tu cuenta está bloqueada');
    return nuevaSesion_(f.sh, i, row);
  });
}
function google_(p) {
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(p.credential || ''), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('No se pudo verificar tu cuenta de Google');
  var info = JSON.parse(r.getContentText());
  if (info.aud !== GOOGLE_CLIENT_ID || String(info.email_verified) !== 'true') throw new Error('Cuenta de Google no válida');
  var email = limpiaEmail_(info.email);
  return lockU_(function () {
    var f = usuarios_(), i = buscar_(f.rows, U.Email, email);
    if (i >= 0) {
      if (f.rows[i][U.Bloqueado]) throw new Error('Tu cuenta está bloqueada');
      f.rows[i][U.Google] = info.sub; return nuevaSesion_(f.sh, i, f.rows[i]);
    }
    var nombre = String(info.given_name || info.name || email.split('@')[0]).replace(/[<>]/g, '').slice(0, 16);
    var row = ['U' + Date.now().toString(36), email, nombre, '', '', info.sub, new Date(), new Date(), 0, '', '[]'];
    f.sh.appendRow(row);
    return nuevaSesion_(f.sh, f.rows.length, row);
  });
}
function salir_(p) {
  CacheService.getScriptCache().remove('ses_' + p.ses);
  try {
    lockU_(function () {
      var f = usuarios_();
      for (var i = 0; i < f.rows.length; i++) {
        var s = String(f.rows[i][U.Tokens] || '');
        if (s.indexOf(p.ses) >= 0) {
          var l = JSON.parse(s).filter(function (x) { return x !== p.ses; });
          f.sh.getRange(i + 2, U.Tokens + 1).setValue(JSON.stringify(l)); break;
        }
      }
    });
  } catch (e) { }
  return {};
}
function recuperar_(p) {
  var email = limpiaEmail_(p.email);
  freno_('rec_' + email, 4, 1800);
  var f = usuarios_();
  if (buscar_(f.rows, U.Email, email) < 0) throw new Error('No hay ninguna cuenta con ese correo');
  var code = String(100000 + Math.floor(Math.random() * 900000));
  CacheService.getScriptCache().put('rec_' + email, code, 900);
  MailApp.sendEmail({
    to: email, name: 'KILLBOT', subject: 'Tu código para KILLBOT: ' + code,
    htmlBody: '<div style="font-family:Arial;background:#05060f;color:#e9f4ff;padding:30px;border-radius:16px;text-align:center">' +
      '<h1 style="color:#22e4ff;letter-spacing:4px">KILLBOT</h1><p>Tu código para cambiar la contraseña es:</p>' +
      '<div style="font-size:38px;font-weight:bold;letter-spacing:10px;color:#17ff5f">' + code + '</div>' +
      '<p style="color:#8aa0bf">Caduca en 15 minutos. Si no lo has pedido tú, ignora este correo.</p></div>'
  });
  return {};
}
function restablecer_(p) {
  var email = limpiaEmail_(p.email), pass = String(p.pass || '');
  freno_('res_' + email, 8, 1800);
  var code = CacheService.getScriptCache().get('rec_' + email);
  if (!code || code !== String(p.codigo || '').trim()) throw new Error('Código incorrecto o caducado');
  if (pass.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  return lockU_(function () {
    var f = usuarios_(), i = buscar_(f.rows, U.Email, email);
    if (i < 0) throw new Error('Cuenta no encontrada');
    var sal = Utilities.getUuid();
    f.rows[i][U.Sal] = sal; f.rows[i][U.Hash] = sha_(sal + pass);
    CacheService.getScriptCache().remove('rec_' + email);
    return nuevaSesion_(f.sh, i, f.rows[i]);
  });
}
function sumaPartida_(email) {
  try {
    var f = usuarios_(), i = buscar_(f.rows, U.Email, email);
    if (i >= 0) f.sh.getRange(i + 2, U.Partidas + 1).setValue(Number(f.rows[i][U.Partidas] || 0) + 1);
  } catch (e) { }
}

/* ═════════════════ PANEL ADMIN ═════════════════ */

function tokenAdmin_() {
  var t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8);
  CacheService.getScriptCache().put('adm_' + t, '1', 14400);
  return t;
}
function esAdminTk_(t) { return !!t && CacheService.getScriptCache().get('adm_' + t) === '1'; }
function llaves_() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('llaves') || '[]'); } catch (e) { return []; } }
function compruebaLlave_(llave, ses) {
  llave = String(llave || '').toLowerCase().replace(/[^0-9a-f]/g, '');
  if (llave.length < 6) throw new Error('Llave no válida');
  var list = llaves_(), h = sha_('killbot|' + llave);
  if (!list.length) {
    var esAdm = false; try { esAdm = sesion_(ses).email === ADMIN_EMAIL; } catch (e) { }
    if (!esAdm) throw new Error('Para registrar tu primera llave, inicia sesión antes con ' + ADMIN_EMAIL);
    list.push(h); PropertiesService.getScriptProperties().setProperty('llaves', JSON.stringify(list));
    return 'nueva';
  }
  if (list.indexOf(h) < 0) throw new Error('Esta llave no está autorizada');
  return 'ok';
}
function adminLlave_(p) {
  freno_('admllave', 10, 600);
  var r = compruebaLlave_(p.llave, p.ses);
  return { adm: tokenAdmin_(), nueva: r === 'nueva' };
}
function adminTotp_(p) {
  freno_('admtotp', 8, 600);
  var sec = PropertiesService.getScriptProperties().getProperty('totp');
  if (!sec) throw new Error('Google Authenticator aún no está configurado (actívalo desde el panel)');
  if (!totpOk_(sec, String(p.codigo || '').trim())) throw new Error('Código incorrecto');
  return { adm: tokenAdmin_() };
}
function adminQr_() {
  freno_('admqr', 20, 600);
  var q = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  CacheService.getScriptCache().put('admq_' + q, 'esperando', 300);
  return { q: q, url: PUBLIC_BASE_URL + '?adm=' + q };
}
function adminQrEstado_(p) {
  var v = CacheService.getScriptCache().get('admq_' + String(p.q || ''));
  if (!v) return { estado: 'caducado' };
  if (v === 'esperando') return { estado: 'esperando' };
  CacheService.getScriptCache().remove('admq_' + p.q);
  return { estado: 'ok', adm: v };
}
function adminAutorizar_(p) {
  freno_('admaut', 10, 600);
  var c = CacheService.getScriptCache(), k = 'admq_' + String(p.q || '');
  if (c.get(k) !== 'esperando') throw new Error('Este QR ha caducado. Genera otro en el ordenador.');
  compruebaLlave_(p.llave, p.ses);
  c.put(k, tokenAdmin_(), 300);
  return {};
}

function b32bytes_(s) {
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', bits = '', out = [];
  s.replace(/=+$/, '').toUpperCase().split('').forEach(function (ch) { var v = abc.indexOf(ch); if (v >= 0) bits += ('00000' + v.toString(2)).slice(-5); });
  for (var i = 0; i + 8 <= bits.length; i += 8) { var v = parseInt(bits.substr(i, 8), 2); out.push(v > 127 ? v - 256 : v); }
  return out;
}
function totpOk_(sec, code) {
  if (!/^\d{6}$/.test(code)) return false;
  var key = b32bytes_(sec), t = Math.floor(Date.now() / 30000);
  for (var d = -1; d <= 1; d++) {
    var c = t + d, msg = [];
    for (var i = 7; i >= 0; i--) { var v = c & 255; msg[i] = v > 127 ? v - 256 : v; c = Math.floor(c / 256); }
    var h = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, msg, key).map(function (b) { return b & 255; });
    var o = h[19] & 15;
    var n = (((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000;
    if (('000000' + n).slice(-6) === code) return true;
  }
  return false;
}
function base32Nuevo_() {
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', s = '';
  for (var i = 0; i < 32; i++) s += abc[Math.floor(Math.random() * 32)];
  return s;
}

function idx_() { try { return JSON.parse(CacheService.getScriptCache().get('kb_idx') || '[]'); } catch (e) { return []; } }
function addIdx_(code) {
  var l = idx_().filter(function (c) { return c !== code; });
  l.push(code); if (l.length > 80) l = l.slice(-80);
  CacheService.getScriptCache().put('kb_idx', JSON.stringify(l), 21600);
}

function admin_(p) {
  if (!esAdminTk_(p.adm)) throw new Error('ADMIN');
  var op = String(p.op || ''), d = p.d || {};
  var c = cfg_();
  if (op === 'resumen') {
    var f = usuarios_();
    var codes = idx_(), activas = [];
    codes.forEach(function (code) {
      var g = load_(code); if (!g) return;
      activas.push({ code: code, modo: g.modo, status: g.status, host: g.hostName || '', jug: g.players.map(function (x) { return x.name + (x.bot ? ' 🤖' : ''); }), upd: g.upd });
    });
    var stats = { total: 0, porSus: {}, porArma: {}, porSala: {}, ultimas: [] };
    try {
      var sh = ss_().getSheetByName('Partidas');
      if (sh && sh.getLastRow() > 1) {
        var v = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();
        stats.total = v.length;
        v.forEach(function (r) { stats.porSus[r[5]] = (stats.porSus[r[5]] || 0) + 1; stats.porArma[r[6]] = (stats.porArma[r[6]] || 0) + 1; stats.porSala[r[7]] = (stats.porSala[r[7]] || 0) + 1; });
        stats.ultimas = v.slice(-15).reverse().map(function (r) { return { f: r[0], code: r[1], modo: r[2], jug: r[3], gana: r[4], sol: r[5] + ' · ' + r[6] + ' · ' + r[7], min: r[8] }; });
      }
    } catch (e) { }
    return {
      ajustes: c.ajustes, cartas: c.cartas, activas: activas.reverse(), stats: stats,
      usuarios: f.rows.map(function (r) { return { email: r[U.Email], nombre: r[U.Nombre], partidas: Number(r[U.Partidas] || 0), google: !!r[U.Google], bloq: !!r[U.Bloqueado], ultimo: r[U.Ultimo] }; }),
      llaves: llaves_().length, totp: !!PropertiesService.getScriptProperties().getProperty('totp')
    };
  }
  if (op === 'ajustes') {
    var a = c.ajustes;
    a.tRefutar = Math.max(10, Math.min(180, Number(d.tRefutar) || 45));
    a.botMs = Math.max(600, Math.min(8000, Number(d.botMs) || 1900));
    a.maxJug = Math.max(2, Math.min(9, Number(d.maxJug) || 9));
    a.bots = !!d.bots; a.mant = !!d.mant;
    a.mantMsg = String(d.mantMsg || '').slice(0, 200);
    a.banner = String(d.banner || '').slice(0, 200);
    a.intro = String(d.intro || '').slice(0, 300) || AJUSTES_DEF.intro;
    if (d.imgVer) a.imgVer = Math.max(1, Number(d.imgVer) || 1);
    guardaCfg_(c); return { ajustes: c.ajustes };
  }
  if (op === 'imgVer') { c.ajustes.imgVer = Number(c.ajustes.imgVer || 1) + 1; guardaCfg_(c); return { imgVer: c.ajustes.imgVer }; }
  if (op === 'carta') {
    var id = String(d.id || '');
    if (!NM[id] || id === 'nucleo') throw new Error('Carta no válida');
    var o = {};
    if (d.n) o.n = String(d.n).replace(/[<>]/g, '').slice(0, 30);
    if (d.d) o.d = String(d.d).replace(/[<>]/g, '').slice(0, 120);
    if (d.c && /^#[0-9a-fA-F]{6}$/.test(d.c)) o.c = d.c;
    if (d.img) o.img = String(d.img).slice(0, 300);
    if (Object.keys(o).length) c.cartas[id] = o; else delete c.cartas[id];
    guardaCfg_(c); return { cartas: c.cartas };
  }
  if (op === 'cerrar') {
    lock_(function () { cache_().remove('kb_' + String(d.code || '')); });
    return {};
  }
  if (op === 'bloquear') {
    return lockU_(function () {
      var f = usuarios_(), i = buscar_(f.rows, U.Email, limpiaEmail_(d.email));
      if (i < 0) throw new Error('Usuario no encontrado');
      if (f.rows[i][U.Email] === ADMIN_EMAIL) throw new Error('No puedes bloquear al admin');
      f.sh.getRange(i + 2, U.Bloqueado + 1).setValue(d.bloq ? 'SI' : '');
      if (d.bloq) f.sh.getRange(i + 2, U.Tokens + 1).setValue('[]');
      return {};
    });
  }
  if (op === 'totpNuevo') {
    var s = base32Nuevo_();
    PropertiesService.getScriptProperties().setProperty('totp', s);
    return { secreto: s, url: 'otpauth://totp/KILLBOT:admin?secret=' + s + '&issuer=KILLBOT' };
  }
  if (op === 'totpQuitar') { PropertiesService.getScriptProperties().deleteProperty('totp'); return {}; }
  if (op === 'llavesBorrar') { PropertiesService.getScriptProperties().deleteProperty('llaves'); return {}; }
  throw new Error('Operación desconocida');
}

/* ═════════════════ DATOS DEL JUEGO ═════════════════ */

var SUS   = ['nova','voltia','tuercas','chispas','megaton','byte','cromo','octo','botler'];
var WEA   = ['destornillador','martillo','laser','llave','soldador','iman','cable','aspiradora','pendrive'];
var ROOMS = ['puente','observatorio','laboratorio','invernadero','cocina','criogenia','hangar','taller','reactor'];
/* Teletransportadores entre salas (índices del anillo) */
var TELE  = [[0,4],[2,6],[3,8]];
var PASOS = [0,1,1,2,2,3,3];   // dado -> salas que puedes avanzar

var NM = {
  nova:'Capitana Nova', voltia:'Voltia', tuercas:'Dr. Tuercas', chispas:'Chispas', megaton:'Megatón',
  byte:'Byte', cromo:'Chef Cromo', octo:'Octo', botler:'Sir Botler',
  destornillador:'Destornillador de plasma', martillo:'Martillo neumático', laser:'Pistola láser',
  llave:'Llave magnética', soldador:'Soplete de fusión', iman:'Imán borra-memorias',
  cable:'Cable de alta tensión', aspiradora:'Aspiradora agujero negro', pendrive:'Pendrive virus',
  puente:'Puente de mando', observatorio:'Observatorio', laboratorio:'Laboratorio', invernadero:'Invernadero',
  cocina:'Cocina orbital', criogenia:'Criogenia', hangar:'Hangar', taller:'Taller de reparación',
  reactor:'Reactor', nucleo:'Núcleo central'
};

/* ═════════════════ UTILIDADES ═════════════════ */

function cache_() { return CacheService.getScriptCache(); }
function load_(code) {
  if (!code) return null;
  var s = cache_().get('kb_' + code);
  return s ? JSON.parse(s) : null;
}
function save_(g) {
  g.ver = (g.ver || 0) + 1;
  g.upd = Date.now();
  cache_().put('kb_' + g.code, JSON.stringify(g), 21600);
}
function lock_(fn) {
  var l = LockService.getScriptLock();
  l.waitLock(10000);
  try { return fn(); } finally { l.releaseLock(); }
}
function rnd_(n) { return Math.floor(Math.random() * n); }
function pick_(a) { return a[rnd_(a.length)]; }
function shuffle_(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = rnd_(i + 1); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function randCode_() {
  var L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', s = '';
  for (var i = 0; i < 4; i++) s += L[rnd_(L.length)];
  return s;
}
function cleanName_(n) {
  n = String(n || '').replace(/[<>]/g, '').trim().slice(0, 14);
  return n || 'Jugador';
}
function byToken_(g, tk) { return g.players.filter(function (p) { return p.token === tk; })[0] || null; }
function byId_(g, id) { return g.players.filter(function (p) { return p.id === id; })[0] || null; }
function bySus_(g, s) { return g.players.filter(function (p) { return p.sus === s; })[0] || null; }
function cur_(g) { return g.players[g.turn]; }
function log_(g, txt) { g.log.push({ t: Date.now(), txt: txt }); if (g.log.length > 60) g.log.shift(); }
function ev_(g, type, data) {
  g.evn = (g.evn || 0) + 1;
  var e = { n: g.evn, type: type, t: Date.now() };
  for (var k in (data || {})) e[k] = data[k];
  g.ev.push(e);
  if (g.ev.length > 10) g.ev.shift();
}
function err_(m) { throw new Error(m); }

/* ═════════════════ MAPA ═════════════════ */

function ring_(a, b) { var d = Math.abs(a - b); return Math.min(d, 9 - d); }
function dist_(from, to) {
  if (from === to) return 0;
  if (from === 'nucleo' || to === 'nucleo') return 1;
  var a = ROOMS.indexOf(from), b = ROOMS.indexOf(to);
  var d = ring_(a, b);
  TELE.forEach(function (t) {
    d = Math.min(d, ring_(a, t[0]) + 1 + ring_(t[1], b), ring_(a, t[1]) + 1 + ring_(t[0], b));
  });
  return d;
}
function reach_(pos, pasos) {
  var out = [];
  ROOMS.concat(['nucleo']).forEach(function (r) {
    var d = dist_(pos, r);
    if (d >= 1 && d <= pasos) out.push(r);
  });
  return out;
}

/* ═════════════════ SALA / LOBBY ═════════════════ */

function newPlayer_(g, name, bot, token) {
  var used = g.players.map(function (p) { return p.sus; });
  var free = SUS.filter(function (s) { return used.indexOf(s) < 0; });
  if (!free.length) err_('La sala está llena (9 robots)');
  var sus = bot ? pick_(free) : free[0];
  var p = {
    id: 'p' + Date.now().toString(36) + rnd_(1000),
    token: token || Utilities.getUuid(),
    name: bot ? nm_(sus) : cleanName_(name),
    sus: sus, bot: !!bot, hand: [], seen: [], alive: true, summoned: false, sawSol: false
  };
  g.players.push(p);
  return p;
}

function crearSala(modo, nombre, user) {
  if (aj_('mant')) err_(aj_('mantMsg') || 'Juego en mantenimiento');
  return lock_(function () {
    var code;
    do { code = randCode_(); } while (load_(code));
    var host = Utilities.getUuid();
    var g = {
      code: code, modo: modo === 'tv' ? 'tv' : 'movil', host: host, status: 'lobby',
      players: [], ver: 0, ev: [], evn: 0, log: [], created: Date.now(), lastAct: Date.now(),
      hostEmail: user ? user.email : '', hostName: user ? user.nombre : ''
    };
    var res = { code: code, token: host, modo: g.modo };
    if (g.modo === 'movil') { res.pid = newPlayer_(g, nombre, false, host).id; g.musicPid = res.pid; }
    save_(g);
    addIdx_(code);
    return res;
  });
}

function unirse(code, nombre) {
  code = String(code || '').toUpperCase();
  return lock_(function () {
    var g = load_(code);
    if (!g) err_('No existe ninguna partida con el código ' + code);
    if (g.status !== 'lobby') err_('Esa partida ya ha empezado');
    if (g.players.length >= aj_('maxJug')) err_('La sala está llena');
    var p = newPlayer_(g, nombre, false);
    if (!g.musicPid) g.musicPid = p.id;
    log_(g, p.name + ' ha subido a bordo');
    save_(g);
    return { code: code, token: p.token, pid: p.id, modo: g.modo };
  });
}

function elegirPersonaje(code, token, sus) {
  return lock_(function () {
    var g = load_(code); if (!g) err_('La partida ya no existe');
    if (g.status !== 'lobby') err_('La partida ya ha empezado');
    var p = byToken_(g, token); if (!p) err_('No estás en esta partida');
    if (SUS.indexOf(sus) < 0) err_('Personaje no válido');
    var o = bySus_(g, sus);
    if (o && o !== p) err_(nm_(sus) + ' ya está cogido');
    p.sus = sus;
    save_(g);
    return view_(g, token);
  });
}

function cambiarNombre(code, token, nombre) {
  return lock_(function () {
    var g = load_(code); if (!g) err_('La partida ya no existe');
    var p = byToken_(g, token); if (!p) err_('No estás en esta partida');
    p.name = cleanName_(nombre);
    save_(g);
    return view_(g, token);
  });
}

function addBot(code, token) {
  return lock_(function () {
    var g = load_(code); if (!g) err_('La partida ya no existe');
    if (g.host !== token) err_('Solo el anfitrión puede añadir bots');
    if (g.status !== 'lobby') err_('La partida ya ha empezado');
    if (!aj_('bots')) err_('Los bots están desactivados');
    if (g.players.length >= aj_('maxJug')) err_('La sala está llena');
    var p = newPlayer_(g, '', true);
    log_(g, '🤖 ' + p.name + ' (bot) se une a la tripulación');
    save_(g);
    return view_(g, token);
  });
}

function quitarJugador(code, token, pid) {
  return lock_(function () {
    var g = load_(code); if (!g) err_('La partida ya no existe');
    var me = byToken_(g, token);
    if (g.host !== token && !(me && me.id === pid)) err_('Solo el anfitrión puede expulsar');
    if (g.status !== 'lobby') err_('La partida ya ha empezado');
    g.players = g.players.filter(function (p) { return p.id !== pid || p.token === g.host; });
    if (!byId_(g, g.musicPid)) { var h = g.players.filter(function (p) { return !p.bot; })[0]; g.musicPid = h ? h.id : null; }
    save_(g);
    return view_(g, token);
  });
}

function empezar(code, token) {
  return lock_(function () {
    var g = load_(code); if (!g) err_('La partida ya no existe');
    if (g.host !== token) err_('Solo el anfitrión puede empezar');
    if (g.players.length < 2) err_('Hacen falta al menos 2 jugadores (puedes añadir bots)');
    deal_(g);
    save_(g);
    return view_(g, token);
  });
}

function deal_(g) {
  var sol = { sus: pick_(SUS), wea: pick_(WEA), room: pick_(ROOMS) };
  var deck = shuffle_(SUS.concat(WEA, ROOMS).filter(function (c) {
    return c !== sol.sus && c !== sol.wea && c !== sol.room;
  }));
  g.players = shuffle_(g.players);
  g.players.forEach(function (p) { p.hand = []; p.seen = []; p.alive = true; p.summoned = false; p.sawSol = false; });
  deck.forEach(function (c, i) { g.players[i % g.players.length].hand.push(c); });
  g.sol = sol;
  g.pos = {};
  var played = g.players.map(function (p) { return p.sus; });
  SUS.forEach(function (s) { g.pos[s] = played.indexOf(s) >= 0 ? 'nucleo' : pick_(ROOMS); });
  var rr = shuffle_(ROOMS);
  g.wpos = {};
  WEA.forEach(function (w, i) { g.wpos[w] = rr[i]; });
  g.status = 'playing';
  g.turn = 0;
  g.phase = 'tirar';
  g.dice = null; g.reach = []; g.sug = null; g.winner = null;
  g.started = Date.now(); g.lastAct = Date.now();
  g.log = [];
  log_(g, '🚨 ALERTA: Lucas ha sido desconectado a bordo de la KB-9. ¡Hay un asesino entre la tripulación!');
  ev_(g, 'inicio', {});
  log_(g, 'Empieza ' + cur_(g).name);
}

function reiniciar(code, token) {
  return lock_(function () {
    var g = load_(code); if (!g) err_('La partida ya no existe');
    if (g.host !== token) err_('Solo el anfitrión puede reiniciar');
    g.status = 'lobby'; g.sol = null; g.phase = null; g.winner = null; g.sug = null;
    g.players.forEach(function (p) { p.hand = []; p.seen = []; p.alive = true; });
    ev_(g, 'lobby', {});
    save_(g);
    return view_(g, token);
  });
}

/* ═════════════════ ESTADO ═════════════════ */

function estado(code, token, ver) {
  var g = load_(code);
  if (!g) return { gone: true };
  if (botDue_(g)) {
    var l = LockService.getScriptLock();
    if (l.tryLock(300)) {
      try {
        g = load_(code);
        if (g && botDue_(g)) { botStep_(g); save_(g); }
      } finally { l.releaseLock(); }
    }
  }
  if (ver && g.ver === ver) return { same: true };
  return view_(g, token);
}

function view_(g, token) {
  var me = byToken_(g, token);
  var v = {
    code: g.code, modo: g.modo, status: g.status, ver: g.ver, evn: g.evn, ev: g.ev, log: g.log,
    isHost: g.host === token, me: me ? me.id : null, turn: g.turn, phase: g.phase,
    dice: g.dice, reach: g.reach || [], pos: g.pos, wpos: g.wpos, winner: g.winner, musicPid: g.musicPid || null, now: Date.now()
  };
  v.players = g.players.map(function (p) {
    return { id: p.id, name: p.name, sus: p.sus, bot: p.bot, alive: p.alive, summoned: p.summoned, n: p.hand.length, host: p.token === g.host };
  });
  if (me) { v.hand = me.hand; v.seen = me.seen; }
  if (g.sug) {
    var s = g.sug;
    v.sug = { by: s.by, sus: s.sus, wea: s.wea, room: s.room, refuter: s.refuter, result: s.result, deadline: s.deadline };
    if (me && (me.id === s.by || me.id === s.refuter)) v.sug.shown = s.shown;
    if (me && s.result === 'esperando' && me.id === s.refuter) {
      v.sug.options = me.hand.filter(function (c) { return c === s.sus || c === s.wea || c === s.room; });
    }
  }
  if (g.status === 'ended' || (me && me.sawSol)) v.sol = g.sol;
  return v;
}

/* ═════════════════ ACCIONES ═════════════════ */

function accion(code, token, act, d, aid) {
  return lock_(function () {
    var g = load_(code); if (!g) err_('La partida ya no existe');
    if (aid) {
      g.aids = g.aids || [];
      if (g.aids.indexOf(aid) >= 0) return view_(g, token);
      g.aids.push(aid); if (g.aids.length > 40) g.aids.shift();
    }
    var p = byToken_(g, token); if (!p) err_('No estás en esta partida');
    if (g.status !== 'playing') err_('La partida no está en juego');
    doAct_(g, p, act, d || {});
    g.lastAct = Date.now();
    save_(g);
    return view_(g, token);
  });
}

function doAct_(g, p, act, d) {
  var isCur = cur_(g) === p;
  if (act === 'refutar') {
    if (!g.sug || g.sug.result !== 'esperando' || g.sug.refuter !== p.id) err_('No te toca enseñar carta');
    var opts = matching_(p, g.sug);
    if (opts.indexOf(d.card) < 0) err_('Esa carta no vale');
    show_(g, p, d.card);
    return;
  }
  if (!isCur) err_('No es tu turno');
  if (!p.alive) err_('Estás eliminado');
  if (g.phase === 'refutar') err_('Espera a que enseñen la carta');

  if (act === 'tirar') {
    if (g.phase !== 'tirar') err_('Ya has tirado');
    g.dice = 1 + rnd_(6);
    g.reach = reach_(g.pos[p.sus], PASOS[g.dice]);
    g.phase = 'mover';
    ev_(g, 'dado', { by: p.id, dice: g.dice });
    log_(g, '🎲 ' + p.name + ' saca un ' + g.dice + ' (avanza hasta ' + PASOS[g.dice] + ' sala' + (PASOS[g.dice] > 1 ? 's' : '') + ')');
  } else if (act === 'quedarse') {
    if (g.phase !== 'tirar' || !p.summoned || g.pos[p.sus] === 'nucleo') err_('No puedes quedarte');
    p.summoned = false;
    g.phase = 'sospechar';
    log_(g, p.name + ' se queda en ' + nm_(g.pos[p.sus]));
  } else if (act === 'mover') {
    if (g.phase !== 'mover') err_('Primero tira los propulsores');
    if ((g.reach || []).indexOf(d.room) < 0) err_('No llegas a esa sala');
    g.pos[p.sus] = d.room;
    p.summoned = false;
    g.reach = [];
    g.phase = d.room === 'nucleo' ? 'accion' : 'sospechar';
    ev_(g, 'mover', { by: p.id, room: d.room });
    log_(g, '🚀 ' + p.name + ' vuela a ' + nm_(d.room));
  } else if (act === 'sospechar') {
    if (g.phase !== 'sospechar') err_('Ahora no puedes sospechar');
    if (SUS.indexOf(d.sus) < 0 || WEA.indexOf(d.wea) < 0) err_('Elige sospechoso y arma');
    suggest_(g, p, d.sus, d.wea);
  } else if (act === 'saltar') {
    if (g.phase !== 'sospechar') err_('Ahora no');
    g.phase = 'accion';
  } else if (act === 'acusar') {
    if (SUS.indexOf(d.sus) < 0 || WEA.indexOf(d.wea) < 0 || ROOMS.indexOf(d.room) < 0) err_('Acusación incompleta');
    accuse_(g, p, d.sus, d.wea, d.room);
  } else if (act === 'fin') {
    if (g.phase !== 'accion' && g.phase !== 'sospechar') err_('Aún no puedes terminar el turno');
    next_(g);
  } else err_('Acción desconocida');
}

function matching_(p, s) {
  return p.hand.filter(function (c) { return c === s.sus || c === s.wea || c === s.room; });
}

function suggest_(g, p, sus, wea) {
  var room = g.pos[p.sus];
  g.pos[sus] = room;
  g.wpos[wea] = room;
  var vic = bySus_(g, sus);
  if (vic && vic !== p) vic.summoned = true;
  g.sug = { by: p.id, sus: sus, wea: wea, room: room, refuter: null, result: null, shown: null };
  log_(g, '🔍 ' + p.name + ' sospecha: ' + nm_(sus) + ' con ' + nm_(wea) + ' en ' + nm_(room));
  ev_(g, 'sospecha', { by: p.id, sus: sus, wea: wea, room: room });
  var n = g.players.length, idx = g.players.indexOf(p);
  for (var k = 1; k < n; k++) {
    var q = g.players[(idx + k) % n];
    var m = matching_(q, g.sug);
    if (m.length) {
      g.sug.refuter = q.id;
      if (m.length === 1 || q.bot) { show_(g, q, q.bot ? botShow_(q, m, p) : m[0]); }
      else {
        g.sug.result = 'esperando';
        g.sug.deadline = Date.now() + aj_('tRefutar') * 1000;
        g.phase = 'refutar';
      }
      return;
    }
  }
  g.sug.result = 'nadie';
  g.phase = 'accion';
  ev_(g, 'nadie', { by: p.id });
  log_(g, '😱 ¡Nadie puede desmentir a ' + p.name + '!');
}

function botShow_(q, m, to) {
  // Enseña preferentemente una carta que ya haya enseñado antes a ese jugador
  q.shownTo = q.shownTo || {};
  var prev = (q.shownTo[to.id] || []).filter(function (c) { return m.indexOf(c) >= 0; });
  return prev.length ? prev[0] : pick_(m);
}

function show_(g, q, card) {
  var by = byId_(g, g.sug.by);
  g.sug.shown = card;
  g.sug.result = 'visto';
  g.sug.refuter = q.id;
  g.phase = 'accion';
  if (by.seen.indexOf(card) < 0) by.seen.push(card);
  q.shownTo = q.shownTo || {};
  q.shownTo[by.id] = q.shownTo[by.id] || [];
  if (q.shownTo[by.id].indexOf(card) < 0) q.shownTo[by.id].push(card);
  ev_(g, 'refutado', { by: by.id, ref: q.id });
  log_(g, '🛡️ ' + q.name + ' le enseña una carta a ' + by.name);
  g.lastAct = Date.now();
}

function accuse_(g, p, sus, wea, room) {
  var ok = g.sol.sus === sus && g.sol.wea === wea && g.sol.room === room;
  log_(g, '⚖️ ' + p.name + ' ACUSA: ' + nm_(sus) + ' con ' + nm_(wea) + ' en ' + nm_(room));
  if (ok) {
    g.status = 'ended'; g.winner = p.id; g.phase = null;
    ev_(g, 'fin', { by: p.id, sus: sus, wea: wea, room: room, ok: true });
    log_(g, '🏆 ¡' + p.name + ' ha resuelto el caso!');
    guardar_(g);
    return;
  }
  p.alive = false; p.sawSol = true;
  ev_(g, 'fallo', { by: p.id, sus: sus, wea: wea, room: room });
  log_(g, '💥 ' + p.name + ' ha fallado y queda ELIMINADO');
  var alive = g.players.filter(function (x) { return x.alive; });
  if (alive.length <= 1) {
    g.status = 'ended'; g.phase = null;
    g.winner = alive.length ? alive[0].id : null;
    ev_(g, 'fin', { by: g.winner, ok: false, last: true });
    log_(g, alive.length ? '🏆 ' + alive[0].name + ' gana por ser el último en pie' : 'Nadie ha resuelto el caso…');
    guardar_(g);
    return;
  }
  next_(g);
}

function next_(g) {
  var n = g.players.length;
  for (var k = 1; k <= n; k++) {
    var i = (g.turn + k) % n;
    if (g.players[i].alive) { g.turn = i; break; }
  }
  g.phase = 'tirar'; g.dice = null; g.reach = [];
  ev_(g, 'turno', { by: cur_(g).id });
}

function guardar_(g) {
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sh = ss.getSheetByName('Partidas');
    if (!sh) {
      sh = ss.insertSheet('Partidas');
      sh.appendRow(['Fecha', 'Código', 'Modo', 'Jugadores', 'Ganador', 'Culpable', 'Arma', 'Sala', 'Minutos']);
      sh.getRange(1, 1, 1, 9).setFontWeight('bold');
    }
    var w = byId_(g, g.winner);
    sh.appendRow([new Date(), g.code, g.modo,
      g.players.map(function (p) { return p.name + (p.bot ? ' (bot)' : ''); }).join(', '),
      w ? w.name : '—', nm_(g.sol.sus), nm_(g.sol.wea), nm_(g.sol.room),
      Math.round((Date.now() - g.started) / 60000)]);
  } catch (e) { }
  if (g.hostEmail) sumaPartida_(g.hostEmail);
}

function setupInicial() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  if (!ss.getSheetByName('Partidas')) {
    var sh = ss.insertSheet('Partidas');
    sh.appendRow(['Fecha', 'Código', 'Modo', 'Jugadores', 'Ganador', 'Culpable', 'Arma', 'Sala', 'Minutos']);
    sh.getRange(1, 1, 1, 9).setFontWeight('bold');
  }
}

/* ═════════════════ BOTS ═════════════════ */

function botDue_(g) {
  if (g.status !== 'playing') return false;
  var now = Date.now();
  if (g.phase === 'refutar') return g.sug && now > g.sug.deadline;
  var c = cur_(g);
  return c && c.bot && now - g.lastAct > aj_('botMs');
}

function unknown_(p, list) {
  var k = p.hand.concat(p.seen);
  return list.filter(function (c) { return k.indexOf(c) < 0; });
}

function botStep_(g) {
  if (g.phase === 'refutar') {           // alguien tarda en enseñar carta
    var q = byId_(g, g.sug.refuter);
    show_(g, q, pick_(matching_(q, g.sug)));
    g.lastAct = Date.now();
    return;
  }
  var p = cur_(g);
  var us = unknown_(p, SUS), uw = unknown_(p, WEA), ur = unknown_(p, ROOMS);
  var sure = us.length === 1 && uw.length === 1 && ur.length === 1;
  if (sure && (g.phase === 'tirar' || g.phase === 'accion' || g.phase === 'sospechar')) {
    accuse_(g, p, us[0], uw[0], ur[0]);
  } else if (g.phase === 'tirar') {
    if (p.summoned && g.pos[p.sus] !== 'nucleo' && ur.indexOf(g.pos[p.sus]) >= 0) doAct_(g, p, 'quedarse', {});
    else doAct_(g, p, 'tirar', {});
  } else if (g.phase === 'mover') {
    var opts = g.reach.filter(function (r) { return r !== 'nucleo'; });
    var good = opts.filter(function (r) { return ur.indexOf(r) >= 0; });
    var dest = good.length ? pick_(good) : (opts.length ? pick_(opts) : g.reach[0]);
    doAct_(g, p, 'mover', { room: dest });
  } else if (g.phase === 'sospechar') {
    var s = (Math.random() < 0.15 || !us.length) ? pick_(SUS) : pick_(us);
    var w = (Math.random() < 0.15 || !uw.length) ? pick_(WEA) : pick_(uw);
    suggest_(g, p, s, w);
  } else if (g.phase === 'accion') {
    next_(g);
  }
  g.lastAct = Date.now();
}
