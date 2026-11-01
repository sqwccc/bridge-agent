/* ============================================================
   内核适配层（替代单文件版 ui.js）
   ------------------------------------------------------------
   为 algo.js / report.js 提供它们依赖的 UI 接口：
     UI.getA() / UI.ST / UI.reassess() / UI.toast() / UI.ALGOS …
   同时提供 BIM 结构模型与构件详情卡的渲染。
   ============================================================ */
(function (global) {
  'use strict';

  var UI = {};
  var A = null;

  var GRADE_COLOR = { A: '#3adc9b', B: '#38d9f5', C: '#ffc251', D: '#ff9351', E: '#ff5f6d', '-': '#63839f' };
  var GRADE_PILL = { A: 'g-a', B: 'g-b', C: 'g-c', D: 'g-d', E: 'g-e', '-': 'neutral' };

  /* 评分口径：各类养护统一走 Dr 式(1)；Ⅰ 类另附结构安全状况初判 */
  var ST_UI = { mgt: 'I', demo: false, veto: false, frRatio: 1.00, ifRatio: 0.95, thr: { watch: 0.80 } };

  function syncThr() { if (ST_UI.thr) global.BA.THR.watch = ST_UI.thr.watch; }
  function assOpts() {
    return { mgt: ST_UI.mgt, veto: ST_UI.veto, frRatio: ST_UI.frRatio, ifRatio: ST_UI.ifRatio };
  }

  var bimMode = 'struct';
  var compHook = null;
  function reassess() {
    syncThr();
    A = global.BA.assess(assOpts());
    UI.A = A;
    try { renderBim(bimMode); } catch (e) { /* 模型视图未挂载时忽略 */ }
    if (UI.onChange) UI.onChange(A);
    return A;
  }

  UI.ST = ST_UI;
  UI.assOpts = assOpts;
  UI.reassess = reassess;
  UI.getA = function () { return A; };
  UI.ensure = function () { return A || reassess(); };
  UI.setMgt = function (mgt) {
    ST_UI.mgt = mgt;
    ST_UI.demo = (mgt !== 'I');
    return reassess();
  };
  UI.toast = function (msg) {
    if (global.App && global.App.toast) global.App.toast(msg);
  };

  /* ============================================================
     BIM 结构模型（双塔自锚式悬索桥，跨径 94+188+94）
     ============================================================ */
  var BIM = {
    W: 1600, H: 560,
    water: 470,
    deckTop: 330, deckBot: 348,
    towers: [520, 1080],
    saddleY: 190,
    anchorX: [240, 1360],
    anchorY: 320,
    ctrlY: 413,
    mainPier: [240, 1360],
    apprPier: [70, 155, 1445, 1530]
  };

  function cableY(x) {
    var t = (x - BIM.towers[0]) / (BIM.towers[1] - BIM.towers[0]);
    if (t < 0 || t > 1) return null;
    return Math.pow(1 - t, 2) * BIM.saddleY + 2 * (1 - t) * t * BIM.ctrlY + t * t * BIM.saddleY;
  }

  var PAL = {
    struct: {
      lead: '#a6ddf7', main: '#7cc4e8', thin: 'rgba(124,196,232,.5)', faint: 'rgba(90,160,200,.28)',
      deckFill: 'rgba(52,124,176,.20)', deckEdge: '#7cc4e8',
      steel: 'rgba(160,220,250,.10)', roof: '#8fc6e4', roofFill: 'rgba(80,160,210,.18)',
      water: 'rgba(70,150,200,.20)', text: '#8fb6d4', grid: true
    },
    photo: {
      lead: '#eef5fa', main: '#cfdde7', thin: 'rgba(200,215,226,.62)', faint: 'rgba(160,180,196,.32)',
      deckFill: 'rgba(180,200,215,.16)', deckEdge: '#cfdde7',
      steel: 'rgba(220,232,242,.10)', roof: '#d9b57e', roofFill: 'rgba(200,165,110,.28)',
      water: 'rgba(120,150,170,.14)', text: '#b9c9d6', grid: false
    }
  };

  function renderBim(mode) {
    var svg = document.getElementById('bimSvg');
    if (!svg) return;
    mode = mode || bimMode;
    bimMode = mode;
    var P = PAL[mode] || PAL.struct;
    var s = BIM, W = s.W, H = s.H;
    var out = [];

    out.push('<defs>');
    out.push('<linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">'
      + (mode === 'photo'
        ? '<stop offset="0" stop-color="#2b4256"/><stop offset="55%" stop-color="#1b2f3f"/><stop offset="100%" stop-color="#0d1a24"/>'
        : '<stop offset="0" stop-color="#082639"/><stop offset="100%" stop-color="#041320"/>')
      + '</linearGradient>');
    out.push('<linearGradient id="waterG" x1="0" y1="0" x2="0" y2="1">'
      + '<stop offset="0" stop-color="' + (mode === 'photo' ? '#16283a' : '#061e31') + '"/>'
      + '<stop offset="100%" stop-color="' + (mode === 'photo' ? '#0a141d' : '#030e18') + '"/></linearGradient>');
    out.push('<filter id="glow"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
    out.push('</defs>');
    out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#skyG)"/>');

    if (P.grid) {
      for (var gx = 40; gx < W; gx += 40) out.push('<line x1="' + gx + '" y1="30" x2="' + gx + '" y2="' + s.water + '" stroke="rgba(70,150,220,.055)"/>');
      for (var gy = 50; gy < s.water; gy += 40) out.push('<line x1="0" y1="' + gy + '" x2="' + W + '" y2="' + gy + '" stroke="rgba(70,150,220,.045)"/>');
    }

    out.push('<rect x="0" y="' + s.water + '" width="' + W + '" height="' + (H - s.water) + '" fill="url(#waterG)"/>');
    out.push('<line x1="0" y1="' + s.water + '" x2="' + W + '" y2="' + s.water + '" stroke="' + P.water + '" stroke-width="1.4"/>');
    for (var wv = 0; wv < 9; wv++) {
      out.push('<line x1="' + (60 + wv * 180) + '" y1="' + (478 + (wv % 3) * 9) + '" x2="' + (170 + wv * 180) + '" y2="' + (478 + (wv % 3) * 9) + '" stroke="' + P.faint + '" stroke-width="1" opacity=".5"/>');
    }

    out.push('<g opacity="' + (mode === 'photo' ? '.66' : '.8') + '">');
    s.apprPier.forEach(function (px) {
      out.push('<rect x="' + (px - 7) + '" y="' + s.deckBot + '" width="14" height="' + (s.water - s.deckBot) + '" fill="' + P.steel + '" stroke="' + P.thin + '" stroke-width="1"/>');
      out.push('<rect x="' + (px - 15) + '" y="' + (s.deckBot + 1) + '" width="30" height="5" fill="none" stroke="' + P.thin + '" stroke-width="1"/>');
    });
    out.push('</g>');

    s.mainPier.forEach(function (px) {
      out.push('<rect x="' + (px - 15) + '" y="' + s.deckBot + '" width="30" height="' + (s.water - s.deckBot) + '" fill="' + P.steel + '" stroke="' + P.main + '" stroke-width="1.4"/>');
      out.push('<rect x="' + (px - 26) + '" y="' + (s.deckBot + 1) + '" width="52" height="8" fill="none" stroke="' + P.main + '" stroke-width="1.2"/>');
      out.push('<rect x="' + (px - 30) + '" y="' + (s.water - 9) + '" width="60" height="9" fill="' + P.steel + '" stroke="' + P.main + '" stroke-width="1"/>');
    });

    var SY = s.saddleY;
    s.towers.forEach(function (cx) {
      var g = '<g>';
      [-1, 1].forEach(function (sg) {
        g += '<rect x="' + (cx + sg * 26 - (sg > 0 ? 0 : 16)) + '" y="' + SY + '" width="16" height="' + (s.water - SY) + '" fill="' + P.steel + '" stroke="' + P.main + '" stroke-width="1.4"/>';
      });
      [SY + 52, SY + 104, s.water - 78].forEach(function (by) {
        g += '<rect x="' + (cx - 26) + '" y="' + by + '" width="52" height="9" fill="' + P.steel + '" stroke="' + P.main + '" stroke-width="1"/>';
      });
      g += '<rect x="' + (cx - 40) + '" y="' + (s.water - 12) + '" width="80" height="12" fill="' + P.steel + '" stroke="' + P.main + '" stroke-width="1.2"/>';
      g += '<rect x="' + (cx - 38) + '" y="' + (SY - 4) + '" width="76" height="9" fill="' + P.steel + '" stroke="' + P.main + '" stroke-width="1.2"/>';
      g += '<rect x="' + (cx - 26) + '" y="' + (SY - 22) + '" width="52" height="18" fill="' + P.roofFill + '" stroke="' + P.roof + '" stroke-width="1.1"/>';
      g += '<path d="M' + (cx - 46) + ',' + (SY - 22) + ' Q' + (cx - 40) + ',' + (SY - 32) + ' ' + (cx - 28) + ',' + (SY - 34) + ' L' + (cx + 28) + ',' + (SY - 34) + ' Q' + (cx + 40) + ',' + (SY - 32) + ' ' + (cx + 46) + ',' + (SY - 22) + ' Z" fill="' + P.roofFill + '" stroke="' + P.roof + '" stroke-width="1.2"/>';
      g += '<path d="M' + (cx - 46) + ',' + (SY - 22) + ' q-5,-1 -8,3" fill="none" stroke="' + P.roof + '" stroke-width="1.2"/>';
      g += '<path d="M' + (cx + 46) + ',' + (SY - 22) + ' q5,-1 8,3" fill="none" stroke="' + P.roof + '" stroke-width="1.2"/>';
      g += '<rect x="' + (cx - 18) + '" y="' + (SY - 50) + '" width="36" height="16" fill="' + P.roofFill + '" stroke="' + P.roof + '" stroke-width="1.1"/>';
      g += '<path d="M' + (cx - 34) + ',' + (SY - 50) + ' Q' + (cx - 28) + ',' + (SY - 60) + ' ' + (cx - 20) + ',' + (SY - 62) + ' L' + (cx + 20) + ',' + (SY - 62) + ' Q' + (cx + 28) + ',' + (SY - 60) + ' ' + (cx + 34) + ',' + (SY - 50) + ' Z" fill="' + P.roofFill + '" stroke="' + P.roof + '" stroke-width="1.2"/>';
      g += '<path d="M' + (cx - 18) + ',' + (SY - 62) + ' L' + cx + ',' + (SY - 88) + ' L' + (cx + 18) + ',' + (SY - 62) + ' Z" fill="' + P.roofFill + '" stroke="' + P.roof + '" stroke-width="1.2"/>';
      g += '<line x1="' + cx + '" y1="' + (SY - 88) + '" x2="' + cx + '" y2="' + (SY - 100) + '" stroke="' + P.roof + '" stroke-width="1.6"/>';
      g += '<circle cx="' + cx + '" cy="' + (SY - 103) + '" r="3" fill="' + P.roof + '"/>';
      [-1, 1].forEach(function (sg) {
        g += '<line x1="' + (cx + sg * 18) + '" y1="' + (SY + 12) + '" x2="' + (cx + sg * 18) + '" y2="' + (s.water - 14) + '" stroke="' + P.faint + '" stroke-width="1"/>';
      });
      g += '</g>';
      out.push(g);
    });

    var d = 'M' + s.anchorX[0] + ',' + s.anchorY
      + ' Q' + (s.anchorX[0] + 110) + ',' + (s.anchorY - 46) + ' ' + s.towers[0] + ',' + s.saddleY
      + ' Q' + ((s.towers[0] + s.towers[1]) / 2) + ',' + s.ctrlY + ' ' + s.towers[1] + ',' + s.saddleY
      + ' Q' + (s.anchorX[1] - 110) + ',' + (s.anchorY - 46) + ' ' + s.anchorX[1] + ',' + s.anchorY;
    out.push('<path d="' + d + '" fill="none" stroke="' + P.lead + '" stroke-width="3.2" stroke-linecap="round" filter="url(#glow)" opacity=".95"/>');
    out.push('<path d="' + d + '" fill="none" stroke="#ffffff" stroke-width=".8" opacity=".5"/>');

    s.anchorX.forEach(function (ax) {
      out.push('<circle cx="' + ax + '" cy="' + s.anchorY + '" r="4.5" fill="none" stroke="' + P.lead + '" stroke-width="1.6"/>');
      out.push('<circle cx="' + ax + '" cy="' + s.anchorY + '" r="1.6" fill="' + P.lead + '"/>');
    });

    out.push('<g opacity=".9">');
    for (var hx = 548; hx <= 1052; hx += 21) {
      var cy = cableY(hx);
      if (cy == null) continue;
      out.push('<line x1="' + hx + '" y1="' + cy.toFixed(1) + '" x2="' + hx + '" y2="' + (s.deckTop + 2) + '" stroke="' + P.thin + '" stroke-width="1"/>');
      out.push('<circle cx="' + hx + '" cy="' + cy.toFixed(1) + '" r="1.5" fill="' + P.main + '"/>');
    }
    out.push('</g>');

    out.push('<g>');
    out.push('<rect x="20" y="' + (s.deckTop - 2) + '" width="' + (s.towers[0] - 20) + '" height="' + (s.deckBot - s.deckTop + 2) + '" fill="' + P.deckFill + '" stroke="' + P.deckEdge + '" stroke-width="1.2"/>');
    out.push('<rect x="' + s.towers[1] + '" y="' + (s.deckTop - 2) + '" width="' + (1580 - s.towers[1]) + '" height="' + (s.deckBot - s.deckTop + 2) + '" fill="' + P.deckFill + '" stroke="' + P.deckEdge + '" stroke-width="1.2"/>');
    out.push('<path d="M' + s.towers[0] + ',' + (s.deckTop - 2) + ' Q800,' + (s.deckTop + 3) + ' ' + s.towers[1] + ',' + (s.deckTop - 2)
      + ' L' + s.towers[1] + ',' + s.deckBot + ' Q800,' + (s.deckBot + 5) + ' ' + s.towers[0] + ',' + s.deckBot + ' Z" fill="' + P.deckFill + '" stroke="' + P.deckEdge + '" stroke-width="1.2"/>');
    out.push('<path d="M20,' + (s.deckTop - 2) + ' L' + s.towers[0] + ',' + (s.deckTop - 2) + ' Q800,' + (s.deckTop + 3) + ' ' + s.towers[1] + ',' + (s.deckTop - 2) + ' L1580,' + (s.deckTop - 2) + '" fill="none" stroke="' + P.lead + '" stroke-width="1.8"/>');
    out.push('<path d="M20,' + (s.deckTop - 9) + ' L' + s.towers[0] + ',' + (s.deckTop - 9) + ' Q800,' + (s.deckTop - 4) + ' ' + s.towers[1] + ',' + (s.deckTop - 9) + ' L1580,' + (s.deckTop - 9) + '" fill="none" stroke="' + P.thin + '" stroke-width="1"/>');
    out.push('</g>');

    var spots = buildSpots();
    out.push('<g id="spotLayer">');
    spots.forEach(function (sp) {
      var st = spotState(sp);
      var cls = 'hotspot' + (st === 'bad' ? ' bad' : (st === 'warn' ? ' warn' : ''));
      var lx = sp.lx, ly = sp.ly, anch = sp.anch || 'start';
      var tw = 16;
      for (var ci = 0; ci < sp.label.length; ci++) {
        tw += sp.label.charCodeAt(ci) > 255 ? 14.4 : 7.6;
      }
      var bx = anch === 'end' ? lx - tw : (anch === 'middle' ? lx - tw / 2 : lx);
      out.push('<g class="' + cls + '" data-code="' + sp.code + '">');
      out.push('<circle class="pulse" cx="' + sp.x + '" cy="' + sp.y + '" r="9"/>');
      out.push('<circle class="ring" cx="' + sp.x + '" cy="' + sp.y + '" r="12"/>');
      out.push('<circle class="core" cx="' + sp.x + '" cy="' + sp.y + '" r="6.4"/>');
      out.push('<circle class="dot" cx="' + sp.x + '" cy="' + sp.y + '" r="2.4"/>');
      out.push('<line x1="' + sp.x + '" y1="' + sp.y + '" x2="' + (lx + (anch === 'end' ? 2 : -2)) + '" y2="' + (ly - 4) + '" stroke="rgba(86,175,255,.35)" stroke-width=".8"/>');
      out.push('<rect class="lb-bg" x="' + bx + '" y="' + (ly - 19) + '" width="' + tw + '" height="24" rx="3"/>');
      out.push('<text class="lb" x="' + (anch === 'end' ? lx - 7 : (anch === 'middle' ? lx : lx + 7)) + '" y="' + (ly - 2) + '" text-anchor="' + anch + '">' + sp.label + '</text>');
      out.push('</g>');
    });
    out.push('</g>');

    out.push('<g opacity=".5"><line x1="1300" y1="524" x2="1430" y2="524" stroke="' + P.thin + '" stroke-width="1"/>'
      + '<line x1="1300" y1="519" x2="1300" y2="529" stroke="' + P.thin + '"/><line x1="1430" y1="519" x2="1430" y2="529" stroke="' + P.thin + '"/>'
      + '<text x="1365" y="517" text-anchor="middle" font-size="9.5" fill="' + P.text + '" font-family="Microsoft YaHei">50 m</text></g>');

    svg.innerHTML = out.join('');
    svg.setAttribute('data-mode', mode);
    svg.querySelectorAll('.hotspot').forEach(function (g2) {
      g2.addEventListener('click', function () {
        var code = g2.getAttribute('data-code');
        if (compHook) compHook(code); else openComp(code);
      });
    });

    var seg = document.querySelectorAll('[data-bimmode]');
    if (seg) seg.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-bimmode') === mode); });
  }

  function buildSpots() {
    return [
      { code: 'G09', x: 800, y: 331, lx: 800, ly: 304, label: '主梁 G09 跨中', anch: 'middle' },
      { code: 'G05', x: 940, y: 333, lx: 940, ly: 376, label: '主梁 G05 位移', anch: 'middle' },
      { code: 'T01', x: 520, y: 268, lx: 446, ly: 232, label: '索塔 T01（7#塔）', anch: 'end' },
      { code: 'T02', x: 1080, y: 268, lx: 1154, ly: 232, label: '索塔 T02（8#塔）', anch: 'start' },
      { code: 'C09', x: 1017, y: 238, lx: 1062, ly: 214, label: '吊索 C09', anch: 'start' },
      { code: 'P01', x: 240, y: 410, lx: 252, ly: 434, label: '桥墩 P01（6#墩）', anch: 'start' },
      { code: 'E02', x: 1360, y: 320, lx: 1300, ly: 296, label: '伸缩缝 E02', anch: 'end' }
    ];
  }
  function spotState(sp) {
    if (!A) return 'ok';
    var cp = A.comps.filter(function (c) { return c.code === sp.code; })[0];
    if (!cp || cp.nodata || cp.eta == null) return 'ok';
    if (cp.eta >= 1.2) return 'bad';
    if (cp.eta >= 0.8) return 'warn';
    return 'ok';
  }

  /* ---------- 构件详情卡 ---------- */
  function barHtml(name, v, max, unit, color) {
    var p = Math.max(2, Math.min(100, v / (max || 1) * 100));
    return '<div class="cc-bar"><span class="nm">' + name + '</span><span class="tr"><span class="fl" style="width:' + p.toFixed(1) + '%;background:' + color + '"></span></span><span class="pv">'
      + global.BA.fmt(v, 2) + (unit || '') + '</span></div>';
  }

  function openComp(code) {
    if (!A) reassess();
    var cp = A && A.comps.filter(function (c) { return c.code === code; })[0];
    var card = document.getElementById('compCard');
    if (!card) return;
    if (!cp) { card.classList.remove('show'); return; }
    document.querySelectorAll('.hotspot').forEach(function (el2) {
      el2.classList.toggle('active', el2.getAttribute('data-code') === code);
    });
    var col = GRADE_COLOR[cp.grade];
    var worst = cp.worst;
    var ids = cp.channels.map(function (c) { return c.id; });
    var h = '<div class="cc-head"><div class="cc-title">' + cp.name + '</div>'
      + '<span class="pill ' + GRADE_PILL[cp.grade] + '">' + cp.grade + ' ' + global.BA.GRADE_NAME[cp.grade] + '</span>'
      + '<div class="cc-close" id="ccClose">✕</div></div><div class="cc-body">';
    h += '<div class="cc-row"><span class="k">健康度</span><span class="v"><span class="big" style="color:' + col + '">'
      + cp.score.toFixed(1) + '</span><span style="color:#63839f;font-size:11px">/ 定检基线 ' + cp.base + '</span></span></div>';
    h += '<div class="cc-row"><span class="k">所属部位</span><span class="v">' + cp.sysName + '</span></div>';
    h += '<div class="cc-row"><span class="k">监测修正</span><span class="v" style="color:' + (cp.ded > 0 ? '#ff9351' : '#3adc9b') + '">'
      + (cp.ded > 0 ? '−' + cp.ded.toFixed(1) : '0.0') + ' 分</span></div>';
    h += '<div class="cc-row"><span class="k">有效通道</span><span class="v">' + cp.valid.length + ' / ' + cp.channels.length + ' 路</span></div>';
    if (worst) {
      h += '<div class="cc-row"><span class="k">最不利测点</span><span class="v" style="color:#ffc251">' + worst.indName + ' η=' + worst.eta.toFixed(2) + '</span></div>';
      h += '<div class="cc-bars">'
        + barHtml('实测峰值', worst.peak, worst.limit, worst.unit, col)
        + barHtml('三级限值', worst.limit, worst.limit, worst.unit, '#ff5f6d')
        + '</div>';
    }
    if (cp.nodata) {
      h += '<div class="cc-note">该构件当期无有效实测通道（' + (cp.noDataReason || '数据缺失') + '），健康度取定检基线 ' + cp.base + '，未做监测修正。</div>';
    } else if (cp.sysOver) {
      h += '<div class="cc-note">同断面 ' + cp.overL2 + '/' + cp.valid.length + ' 路通道同步超过二级阈值，呈系统性特征，优先怀疑阈值标定偏差，建议人工复核。</div>';
    }
    h += '<div class="cc-code">唯一编号：' + ids.slice(0, 3).join(' · ') + (ids.length > 3 ? ' 等 ' + ids.length + ' 个' : '') + '</div>';
    h += '</div>';
    card.innerHTML = h;
    card.classList.add('show');
    var c = document.getElementById('ccClose');
    if (c) c.onclick = function () {
      card.classList.remove('show');
      document.querySelectorAll('.hotspot').forEach(function (el3) { el3.classList.remove('active'); });
    };
  }

  /* ---------- 算法入口 ---------- */
  var ALGOS = [
    { id: 'A1', key: 'score', name: '总体状况评分 Dr', sub: '式(1) 五项加权 + 表2/表3 ｜ 取 min' },
    { id: 'A2', key: 'threshold', name: '阈值分级报警', sub: '三级 / 二级 / 一级逐级判定' },
    { id: 'A3', key: 'corr', name: '相关性筛查', sub: 'Pearson 矩阵 · 数据质量' },
    { id: 'A4', key: 'anomaly', name: '无监督异常识别', sub: '状态编码 VG / N_ab / G_ab' },
    { id: 'A5', key: 'cable', name: '索力频率法', sub: 'T = 4mL²f²' },
    { id: 'A6', key: 'temp', name: '温度效应分离', sub: '回归基线 · 残差提取' },
    { id: 'A7', key: 'trend', name: '增量建模趋势', sub: '分段基线 · 漂移速率' },
    { id: 'V1', key: 'vib', name: '振动分析', sub: '峰值时程 · 幅值排序 · 一致性' },
    { id: 'A8', key: 'rules', name: '判定规则集', sub: '规范依据与工程判据' },
    { id: 'P', key: 'plan', name: '测点布置图', sub: '立面 · 横断面 · 统计', hidden: true },
    { id: 'R', key: 'report', name: '监测日报', sub: 'A4 报告 · 可打印', hidden: true }
  ];

  UI.GRADE_COLOR = GRADE_COLOR;
  UI.GRADE_PILL = GRADE_PILL;
  UI.ALGOS = ALGOS;
  UI.renderBim = renderBim;
  UI.setCompHook = function (fn) { compHook = fn || null; };
  UI.openComp = openComp;
  UI.bimMode = function (m) { if (m) bimMode = m; return bimMode; };
  UI.BIM = BIM;

  global.UI = UI;
})(window);
