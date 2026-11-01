/* ============================================================
   轻量 SVG 图表工具（无外部依赖）
   ============================================================ */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function T(x, y, s, attrs) {
    var t = el('text', Object.assign({ x: x, y: y, 'font-size': 10, fill: '#7ea0bd', 'font-family': 'Consolas,monospace' }, attrs || {}));
    t.textContent = s;
    return t;
  }
  function niceTicks(min, max, count) {
    if (!isFinite(min) || !isFinite(max)) return [];
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;
    if (!(span > 0)) return [];
    var step = Math.pow(10, Math.floor(Math.log(span / count) / Math.LN10));
    if (!isFinite(step) || step <= 0) return [min, max];
    var err = (span / count) / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [], v = Math.ceil(min / step) * step;
    // 硬保护：步长小于浮点分辨率时 v += step 不前进，会把数组撑爆
    for (var guard = 0; v <= max + step * 0.001 && guard < 200; guard++) {
      out.push(Math.round(v / step) * step);
      var nv = v + step;
      if (nv === v) break;
      v = nv;
    }
    return out;
  }

  /* ---------- 折线图 ---------- */
  function lineChart(opt) {
    var w = opt.w || 660, h = opt.h || 200;
    var pad = Object.assign({ l: 46, r: 12, t: 12, b: 26 }, opt.pad || {});
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none' });
    svg.style.height = (opt.cssH || h) + 'px';
    var iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;

    /* 对数纵轴：内部统一转 log10 计算坐标，刻度再还原成原值 */
    var yLog = !!opt.yLog;
    var yFloor = opt.yFloor || 1e-8;
    function TY(v) { return yLog ? Math.log10(Math.max(Math.abs(v), yFloor)) : v; }

    var series = opt.series || [];
    var allX = [], allY = [];
    series.forEach(function (s) {
      s.pts.forEach(function (p) {
        if (p[1] == null || !isFinite(p[1])) return;   // null = 断点标记
        allX.push(p[0]); allY.push(TY(p[1]));
      });
    });
    if (!allX.length) return svg;
    var xmin = opt.xDomain ? opt.xDomain[0] : Math.min.apply(null, allX);
    var xmax = opt.xDomain ? opt.xDomain[1] : Math.max.apply(null, allX);
    var xRef = Math.max(Math.abs(xmin), Math.abs(xmax), 1);
    if (!((xmax - xmin) > xRef * 1e-12)) { xmin -= 1; xmax += 1; }
    var ymin = opt.yDomain ? TY(opt.yDomain[0]) : Math.min.apply(null, allY);
    var ymax = opt.yDomain ? TY(opt.yDomain[1]) : Math.max.apply(null, allY);
    // 相对容差：恒定序列或仅浮点噪声级别的差异，统一撑成可见区间
    var yRef = Math.max(Math.abs(ymin), Math.abs(ymax), 1);
    if (!((ymax - ymin) > yRef * 1e-6)) {
      var d0 = Math.max(yRef * 0.02, yLog ? 0.05 : 1e-6);
      ymin -= d0; ymax += d0;
    }
    var py = (ymax - ymin) * 0.12;
    if (!opt.yDomain) { ymin -= py; ymax += py; }

    function X(x) { return pad.l + (x - xmin) / (xmax - xmin || 1) * iw; }
    function Y(y) { return pad.t + (1 - (TY(y) - ymin) / (ymax - ymin || 1)) * ih; }

    // 网格 + y 轴
    var ticks = niceTicks(ymin, ymax, opt.yTicks || 4);
    ticks.forEach(function (t) {
      if (t < ymin || t > ymax) return;
      el('line', { x1: pad.l, x2: w - pad.r, y1: pad.t + (1 - (t - ymin) / (ymax - ymin || 1)) * ih, y2: pad.t + (1 - (t - ymin) / (ymax - ymin || 1)) * ih, stroke: 'rgba(86,175,255,.10)', 'stroke-width': 1 }, svg);
      svg.appendChild(T(pad.l - 6, pad.t + (1 - (t - ymin) / (ymax - ymin || 1)) * ih + 3,
        yLog ? fmtTick(Math.pow(10, t)) : fmtTick(t), { 'text-anchor': 'end' }));
    });
    // 阈值带
    (opt.bands || []).forEach(function (b) {
      if (b.lo == null || b.hi == null) return;
      var tHi = TY(b.hi), tLo = TY(b.lo);
      if (!(tHi > tLo)) return;
      var y1 = pad.t + (1 - (Math.min(tHi, ymax) - ymin) / (ymax - ymin || 1)) * ih;
      var y2 = pad.t + (1 - (Math.max(tLo, ymin) - ymin) / (ymax - ymin || 1)) * ih;
      el('rect', { x: pad.l, y: y1, width: iw, height: Math.max(0, y2 - y1), fill: b.color || 'rgba(255,95,109,.10)' }, svg);
    });
    // 阈值线
    (opt.hlines || []).forEach(function (l) {
      var ty = TY(l.y);
      if (ty < ymin || ty > ymax) return;
      el('line', {
        x1: pad.l, x2: w - pad.r, y1: Y(l.y), y2: Y(l.y),
        stroke: l.color || '#ff5f6d', 'stroke-width': 1, 'stroke-dasharray': '4 3', opacity: .8
      }, svg);
      if (l.label) svg.appendChild(T(w - pad.r - 2, Y(l.y) - 4, l.label, { 'text-anchor': 'end', fill: l.color || '#ff5f6d', 'font-size': 9 }));
    });

    // x 轴标签
    var nLab = opt.xLabels || 4;
    for (var i = 0; i <= nLab; i++) {
      var xv = xmin + (xmax - xmin) * i / nLab;
      var lab = opt.xFormat ? opt.xFormat(xv) : String(Math.round(xv));
      svg.appendChild(T(X(xv), h - 8, lab, { 'text-anchor': i === 0 ? 'start' : (i === nLab ? 'end' : 'middle') }));
    }
    // 折线
    series.forEach(function (s) {
      if (!s.pts.length) return;
      /* 逐点构建；遇到 null 表示采集中断，重新起笔（不跨空档连线） */
      var d = '', pen = false, hasGap = false, segs = 0;
      s.pts.forEach(function (p) {
        if (p[1] == null || !isFinite(p[1])) { hasGap = true; pen = false; return; }
        d += (pen ? 'L' : 'M') + X(p[0]).toFixed(2) + ',' + Y(p[1]).toFixed(2);
        if (!pen) segs++;
        pen = true;
      });
      if (s.area && !hasGap) {
        var d2 = d + 'L' + X(s.pts[s.pts.length - 1][0]).toFixed(2) + ',' + (pad.t + ih) + 'L' + X(s.pts[0][0]).toFixed(2) + ',' + (pad.t + ih) + 'Z';
        el('path', { d: d2, fill: s.color, opacity: .10 }, svg);
      }
      if (s.w !== 0 && d) {
        el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': (s.w == null ? 1.6 : s.w), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
      }
      if (s.dots !== false && !hasGap && s.pts.length <= 60) {
        s.pts.forEach(function (p) {
          if (p[1] == null || !isFinite(p[1])) return;
          el('circle', { cx: X(p[0]), cy: Y(p[1]), r: s.r || 1.8, fill: s.color }, svg);
        });
      }
    });
    // 竖向标记
    (opt.vmarks || []).forEach(function (m) {
      if (m.x < xmin || m.x > xmax) return;
      el('line', { x1: X(m.x), x2: X(m.x), y1: pad.t, y2: pad.t + ih, stroke: m.color || '#ffc251', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .7 }, svg);
      if (m.label) svg.appendChild(T(X(m.x) + 3, pad.t + 9, m.label, { fill: m.color || '#ffc251', 'font-size': 9 }));
    });
    return svg;
  }

  function fmtTick(v) {
    var a = Math.abs(v);
    if (a >= 1000) return (v / 1000).toFixed(a >= 10000 ? 0 : 1) + 'k';
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return v.toFixed(1).replace(/\.0$/, '');
    if (a >= 0.01) return v.toFixed(2);
    return v.toExponential(0);
  }

  /* ---------- 横向条 ---------- */
  function hbars(opt) {
    var items = opt.items || [];
    var w = opt.w || 460, rowH = opt.rowH || 26;
    var h = items.length * rowH + 6;
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none' });
    var lab = opt.labelW || 96, valW = 52;
    var bw = w - lab - valW;
    items.forEach(function (it, i) {
      var y = i * rowH + 4;
      svg.appendChild(T(0, y + 12, it.name, { 'font-size': 10.5, fill: '#a9c8e2', 'font-family': 'Microsoft YaHei,sans-serif' }));
      el('rect', { x: lab, y: y + 4, width: bw, height: 9, rx: 1, fill: 'rgba(50,95,140,.28)' }, svg);
      var v = Math.max(0, Math.min(1, it.value / (it.max || 100)));
      el('rect', { x: lab, y: y + 4, width: Math.max(1.5, bw * v), height: 9, rx: 1, fill: it.color || '#38d9f5' }, svg);
      if (it.mark != null) {
        var mx = lab + bw * Math.max(0, Math.min(1, it.mark / (it.max || 100)));
        el('line', { x1: mx, x2: mx, y1: y + 1, y2: y + 16, stroke: '#ffc251', 'stroke-width': 1, 'stroke-dasharray': '2 2' }, svg);
      }
      svg.appendChild(T(w, y + 12, it.text || it.value.toFixed(1), { 'text-anchor': 'end', 'font-size': 10.5, fill: it.color || '#dff1ff', 'font-family': 'Consolas,monospace' }));
    });
    return svg;
  }

  /* ---------- 分组条形（同断面双通道对比） ---------- */
  function groupBars(opt) {
    var groups = opt.groups || [];       // [{name, a, b}]  a=-01  b=-02
    var w = opt.w || 600, rowH = opt.rowH || 30;
    var h = Math.max(1, groups.length) * rowH + 8;
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none' });
    var lab = opt.labelW || 64, valW = opt.valW || 58;
    var bw = Math.max(40, w - lab - valW);
    var cA = opt.colorA || '#38d9f5', cB = opt.colorB || '#ff9f4a';

    var vals = [];
    groups.forEach(function (g) {
      if (isFinite(g.a) && g.a > 0) vals.push(g.a);
      if (isFinite(g.b) && g.b > 0) vals.push(g.b);
    });
    if (!vals.length) return svg;
    var mx = Math.max.apply(null, vals);
    var mn = Math.min.apply(null, vals);
    var yLog = !!opt.yLog;
    function frac(v) {
      if (!isFinite(v) || v <= 0) return 0;
      if (!yLog) return Math.max(0, Math.min(1, v / mx));
      var lo = Math.log10(Math.max(mn, mx / 1e6)), hi = Math.log10(mx);
      return Math.max(0, Math.min(1, (Math.log10(v) - lo) / ((hi - lo) || 1)));
    }

    groups.forEach(function (g, i) {
      var y = i * rowH + 5;
      svg.appendChild(T(0, y + 14, g.name, { 'font-size': 10.5, fill: '#a9c8e2', 'font-family': 'Microsoft YaHei,sans-serif' }));
      [['a', cA, 0], ['b', cB, 12]].forEach(function (k) {
        var v = g[k[0]];
        var fr = frac(v);
        el('rect', { x: lab, y: y + 3 + k[2], width: bw, height: 9, rx: 1, fill: 'rgba(50,95,140,.28)' }, svg);
        if (fr > 0) el('rect', { x: lab, y: y + 3 + k[2], width: Math.max(2, bw * fr), height: 9, rx: 1, fill: k[1] }, svg);
      });
      var f = (g.a > 0 && g.b > 0) ? Math.max(g.a, g.b) / Math.min(g.a, g.b) : null;
      var txt = (f && f >= 4) ? ('×' + (f >= 10 ? f.toFixed(0) : f.toFixed(1))) : '—';
      svg.appendChild(T(w, y + 14, txt, {
        'text-anchor': 'end', 'font-size': 11,
        fill: (f && f >= 4) ? '#ff8f99' : '#5f809b',
        'font-family': 'Consolas,monospace', 'font-weight': (f && f >= 4) ? 700 : 400
      }));
    });
    return svg;
  }

  /* ---------- 环形仪表 ---------- */
  function gauge(value, color, sub, size) {
    size = size || 104;
    var r = size / 2 - 8, cx = size / 2, cy = size / 2;
    var C = 2 * Math.PI * r;
    var v = Math.max(0, Math.min(100, value));
    var svg = el('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size });
    el('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: 'rgba(60,110,160,.22)', 'stroke-width': 7 }, svg);
    // 刻度
    for (var i = 0; i < 60; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / 60;
      var r1 = r - 10, r2 = r - 7;
      el('line', {
        x1: cx + Math.cos(a) * r1, y1: cy + Math.sin(a) * r1,
        x2: cx + Math.cos(a) * r2, y2: cy + Math.sin(a) * r2,
        stroke: 'rgba(86,175,255,.20)', 'stroke-width': .8
      }, svg);
    }
    el('circle', {
      cx: cx, cy: cy, r: r, fill: 'none', stroke: color, 'stroke-width': 7,
      'stroke-linecap': 'round',
      'stroke-dasharray': (C * v / 100) + ' ' + C,
      transform: 'rotate(-90 ' + cx + ' ' + cy + ')',
      style: 'filter:drop-shadow(0 0 6px ' + color + '88)'
    }, svg);
    return svg;
  }

  /* ---------- 热力图 ---------- */
  function heatmap(opt) {
    var labels = opt.labels, m = opt.m;
    var n = labels.length;
    var cell = opt.cell || 26, labW = opt.labW || 74;
    var w = labW + n * cell + 6, h = labW + n * cell + 6;
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'xMinYMin meet' });
    svg.style.width = w + 'px'; svg.style.height = h + 'px';
    for (var i = 0; i < n; i++) {
      svg.appendChild(T(labW - 6, labW + i * cell + cell / 2 + 3, labels[i], { 'text-anchor': 'end', 'font-size': 9, fill: '#8fb0c9' }));
      for (var j = 0; j < n; j++) {
        var v = m[i][j];
        var c = v == null ? 'rgba(60,110,160,.10)' : heatColor(v);
        var rect = el('rect', {
          x: labW + j * cell, y: labW + i * cell, width: cell - 1, height: cell - 1,
          fill: c, class: 'heat-cell'
        }, svg);
        if (v != null && n <= 10) {
          var t = el('text', {
            x: labW + j * cell + cell / 2, y: labW + i * cell + cell / 2 + 3,
            'text-anchor': 'middle', 'font-size': 8.5,
            fill: Math.abs(v) > 0.55 ? '#04121f' : '#b9d6ea', 'font-family': 'Consolas,monospace'
          }, svg);
          t.textContent = v.toFixed(2).replace('0.', '.');
        }
      }
      if (n <= 14) {
        var tt = el('text', {
          x: labW + i * cell + cell / 2, y: labW - 5, 'text-anchor': 'start', 'font-size': 9, fill: '#8fb0c9',
          transform: 'rotate(-55 ' + (labW + i * cell + cell / 2) + ' ' + (labW - 5) + ')'
        }, svg);
        tt.textContent = labels[i];
      }
    }
    return svg;
  }
  function heatColor(v) {
    // 0 → 深蓝灰，1 → 青，负相关 → 红
    var a = Math.min(1, Math.abs(v));
    if (v >= 0) {
      var r = Math.round(12 + a * 44), g = Math.round(40 + a * 177), b = Math.round(70 + a * 175);
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    var r2 = Math.round(30 + a * 225), g2 = Math.round(40 + a * 55), b2 = Math.round(60 + a * 49);
    return 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
  }

  /* ---------- 状态条 ---------- */
  function stateStrip(states, abnormal, colors) {
    var n = states.length;
    var svg = el('svg', { viewBox: '0 0 ' + n * 6 + ' 30', preserveAspectRatio: 'none' });
    svg.style.width = '100%'; svg.style.height = '30px';
    states.forEach(function (s, i) {
      var hh = 8 + s * (18 / Math.max(1, Math.max.apply(null, states)));
      el('rect', {
        x: i * 6, y: 30 - hh, width: 4.6, height: hh, rx: 1,
        fill: abnormal[i] ? '#ff5f6d' : 'rgba(56,217,245,.55)'
      }, svg);
    });
    return svg;
  }

  global.CH = { el: el, T: T, lineChart: lineChart, hbars: hbars, groupBars: groupBars, gauge: gauge, heatmap: heatmap, stateStrip: stateStrip, niceTicks: niceTicks };
})(window);
