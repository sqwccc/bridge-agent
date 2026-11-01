/* ============================================================
   万福大桥 · 监测点布置几何
   ------------------------------------------------------------
   桥梁基本参数来源：
     《扬州万福大桥主梁体系转换研究》(桥梁建设 2016,46(3):57-62)
     主桥 (94+188+94) m 混凝土主梁自锚式悬索桥，塔梁分离体系，
     桥塔总高 86.119 m，主缆垂跨比 1:4.1，双层主梁，桥宽 30.5 m
   纵向里程以 6# 墩顶（西侧伸缩缝）为 0 点，向 9# 墩递增。
   ============================================================ */
(function (g) {
  'use strict';
  var BA = g.BA;
  function D() { return BA.D; }

  var GEO = {
    side: 94, main: 188, total: 376,
    deckW: 30.5,
    towerH: 86.119,
    aboveDeck: 62,            // 桥面以上塔高（按塔总高 86.119 m 扣桥面以下约 24 m 估算）
    belowDeck: 30,
    sagRatio: 1 / 4.1,
    cableGap: 9.4,            // 吊索纵向间距（主跨 188 m 按 20 个间距布置）
    tower: [{ code: 'T01', name: '7#塔', x: 94 }, { code: 'T02', name: '8#塔', x: 282 }],
    pier: [{ name: '6#墩', x: 0 }, { name: '9#墩', x: 376 }],
    spanName: function (x) {
      if (x < 1) return '6#墩顶';
      if (x < 93) return '7#孔（边跨 94 m）';
      if (x <= 95) return '7#塔根';
      if (x < 281) return '8#孔（主跨 188 m）';
      if (x <= 283) return '8#塔根';
      return '9#孔（边跨 94 m）';
    }
  };

  /* ---------- 指标配色与图形 ---------- */
  var IND = {
    '位移':      { c: '#38d9f5', s: 'sq',   n: '位移' },
    '振动加速度': { c: '#9b8bf4', s: 'tri',  n: '振动加速度' },
    '应变':      { c: '#5fd08a', s: 'dia',  n: '应变' },
    '裂缝':      { c: '#ff9351', s: 'bar',  n: '裂缝' },
    '温度':      { c: '#ffc251', s: 'circ', n: '温度' },
    '湿度':      { c: '#4fa8d8', s: 'circ', n: '湿度' },
    '风速':      { c: '#7ee0c8', s: 'vane', n: '风速' },
    'XY倾角':    { c: '#e88fd0', s: 'dia',  n: '倾角' },
    '索力':      { c: '#ff6f91', s: 'sq',   n: '索力' },
    '地震加速度': { c: '#ff5f6d', s: 'tri',  n: '地震加速度' }
  };
  function indColor(n) { return (IND[n] || {}).c || '#8fb0c9'; }

  /* ---------- 断面里程 ---------- */
  var SECX = {
    E01: 0, E02: 376, P04: 376,
    G02: 23.5, G03: 47, G04: 70.5,
    G07: 141, G09: 188, G11: 235,
    G14: 305.5, G15: 329, G16: 352.5,
    T01: 94, T02: 282,
    T03: 47, T09: 188, T15: 329
  };

  /* 8#孔 n/8、n/4、1/2 截面 → 里程 */
  function eighth(nm) {
    var m = /8#孔\s*(\d)\s*\/\s*8\s*[裁截面]/.exec(nm);
    if (m) return 94 + 188 * parseInt(m[1], 10) / 8;
    var m2 = /8#孔\s*(\d)\s*\/\s*4\s*[裁截面]/.exec(nm);
    if (m2) return 94 + 188 * parseInt(m2[1], 10) / 4;
    var m3 = /8#孔\s*(\d)\s*\/\s*2\s*[裁截面]/.exec(nm);
    if (m3) return 94 + 188 * parseInt(m3[1], 10) / 2;
    return null;
  }
  function halfSec(nm) {          // 7#孔 / 9#孔 的 n/4 截面
    var m = /([79])#孔[^0-9]{0,6}(\d)\s*\/\s*4/.exec(nm);
    if (!m) {
      var m2 = /([79])#孔[^0-9]{0,8}跨中/.exec(nm);
      if (m2) {
        var b = m2[1] === '7' ? 0 : 282;
        return b + 47;
      }
      return null;
    }
    var base = m[1] === '7' ? 0 : 282;
    return base + 94 * parseInt(m[2], 10) / 4;
  }

  /* 吊索：按「塔 + 方位 + 第 N 根」定位 */
  function cableX(nm) {
    var d = GEO.cableGap;
    if (/8#孔跨中/.test(nm)) return 188;
    var m = /([78])#(?:桥)?塔\s*(西|东)侧\s*第([一二三四五六])\s*根/.exec(nm);
    if (m) {
      var base = m[1] === '7' ? 94 : 282;
      var k = '一二三四五六'.indexOf(m[3]) + 1;
      return m[2] === '东' ? base + k * d : base - k * d;
    }
    var m2 = /([78])#塔顶[左右]幅?拉索锚固层/.exec(nm);
    if (m2) return m2[1] === '7' ? 94 : 282;
    return null;
  }

  /* 纵向里程 */
  function placeX(d, nm) {
    var code = d.locCode;
    if (code.charAt(0) === 'C') { var cx = cableX(nm); if (cx != null) return cx; }
    if (code === 'G05') {
      if (/7#桥塔截面/.test(nm)) return 94;
      if (/9#桥塔截面/.test(nm)) return 282;
      var e = eighth(nm); if (e != null) return e;
    }
    if (code === 'P01') return /7#墩/.test(nm) ? 94 : 0;
    if (code === 'T01') return 94;
    if (code === 'T02') return 282;
    var h = halfSec(nm); if (h != null && /^G0[234]$|^G1[456]$/.test(code)) return h;
    if (SECX[code] != null) return SECX[code];
    return null;
  }

  /* 立面纵向带：梁上 / 梁体 / 梁下 / 塔 / 索 / 墩 */
  function placeBand(d, nm) {
    var code = d.locCode;
    if (code.charAt(0) === 'C') return 'cable';
    if (code === 'T01' || code === 'T02') return 'tower';
    if (code === 'P01' || code === 'P04') return 'pier';
    if (code === 'E01' || code === 'E02') return 'edge';
    if (/塔顶|锚固层/.test(nm)) return 'tower';
    if (/护栏|桥面/.test(nm)) return 'rail';
    if (/箱梁内|箱内/.test(nm)) return 'inner';
    if (/底板/.test(nm)) return 'bot';
    return 'girder';
  }

  /* 横断面横向位置 */
  function placeLat(d, nm) {
    if (/顶板/.test(nm)) return 'top';
    if (/箱梁内|箱内/.test(nm)) return 'inner';
    if (/左腹板/.test(nm)) return 'webL';
    if (/右腹板/.test(nm)) return 'webR';
    if (/底板/.test(nm)) return 'bot';
    if (/护栏|桥面/.test(nm)) return 'rail';
    if (/支座/.test(nm)) return 'bearing';
    if (/塔顶|锚固层/.test(nm)) return 'towerTop';
    if (/拉索|吊索/.test(nm)) return 'cable';
    var c = d.locCode.charAt(0);
    if (c === 'C') return 'cable';
    if (c === 'T') return 'towerTop';
    if (c === 'P' || c === 'E') return 'bearing';
    return 'top';
  }

  /* ---------- 构建 ---------- */
  function build() {
    var pt = {};
    D().points.forEach(function (p) { pt[p.id] = p; });

    var items = [];
    D().devices.forEach(function (d) {
      var p = pt[d.id] || {};
      var nm = p.name || '';
      var x = placeX(d, nm);
      if (x == null) x = 0;
      items.push({
        id: d.id, code: d.locCode, ind: d.indName, unit: d.unit,
        name: nm, loc: d.loc, sys: d.sys,
        x: x, band: placeBand(d, nm), lat: placeLat(d, nm),
        side: /左幅/.test(nm) ? 'L' : (/右幅/.test(nm) ? 'R' : 'B'),
        device: d
      });
    });

    /* 按里程聚合为断面（0.5 m 容差） */
    var keys = {};
    items.forEach(function (it) {
      var k = Math.round(it.x * 2) / 2;
      (keys[k] = keys[k] || []).push(it);
    });
    var sections = Object.keys(keys).map(Number).sort(function (a, b) { return a - b; })
      .map(function (x) {
        var arr = keys[x];
        var byInd = {};
        arr.forEach(function (it) { byInd[it.ind] = (byInd[it.ind] || 0) + 1; });
        var codeSet = {};
        arr.forEach(function (it) { codeSet[it.code] = 1; });
        var codeList = Object.keys(codeSet).sort();
        return {
          x: x, key: x.toFixed(1), n: arr.length, items: arr,
          byInd: byInd, codes: codeList,
          span: GEO.spanName(x),
          label: secLabel(x, codeList)
        };
      });

    /* 统一编号：梁上 / 塔 / 墩 断面为 1..n，索力断面为 C01.. */
    var mi = 0, ci = 0;
    sections.forEach(function (sec) {
      var isCab = sec.items.every(function (it) { return it.band === 'cable'; });
      if (isCab) {
        ci++; sec.secNo = 'C' + (ci < 10 ? '0' : '') + ci;
        sec.label = cableLabel(sec.items[0].name || '');
      } else { mi++; sec.secNo = String(mi); }
      sec.isCable = isCab;
    });

    /* 汇总统计 */
    var byInd = {}, byPart = {}, bySide = { L: 0, R: 0, B: 0 };
    items.forEach(function (it) {
      byInd[it.ind] = (byInd[it.ind] || 0) + 1;
      byPart[it.loc] = (byPart[it.loc] || 0) + 1;
      bySide[it.side]++;
    });

    return {
      geo: GEO, ind: IND, items: items, sections: sections,
      byInd: byInd, byPart: byPart, bySide: bySide,
      nDev: D().devices.length, nPt: D().points.length, nSec: sections.length
    };
  }

  /* 吊索位置名：左幅7#桥塔西侧第二根拉索 → 7#塔西侧② */
  function cableLabel(nm) {
    var CN = { '一': '①', '二': '②', '三': '③', '四': '④', '五': '⑤', '六': '⑥' };
    var m = /(\d)#(?:桥)?塔\s*(西|东)侧\s*第([一二三四五六])\s*根/.exec(nm);
    if (m) return m[1] + '#塔' + m[2] + '侧' + (CN[m[3]] || m[3]);
    if (/8#孔\s*跨中/.test(nm)) return '8#孔跨中';
    return nm.replace(/^[左右]幅/, '').replace('拉索', '吊索');
  }

  function secLabel(x, codes) {
    if (Math.abs(x) < 0.1) return '6#墩顶·梁端';
    if (Math.abs(x - 376) < 0.1) return '9#墩顶·梁端';
    if (Math.abs(x - 94) < 0.1) return '7#塔根（桥塔）';
    if (Math.abs(x - 282) < 0.1) return '8#塔根（桥塔）';
    var map = { G02: '7#孔 1/4', G03: '7#孔 跨中', G04: '7#孔 3/4', G07: '8#孔 1/4', G09: '8#孔 跨中',
      G11: '8#孔 3/4', G14: '9#孔 1/4', G15: '9#孔 跨中', G16: '9#孔 3/4' };
    var main = codes.filter(function (c) { return map[c]; }).map(function (c) { return map[c]; });
    if (main.length) return main[0];
    if (codes.some(function (c) { return c === 'G05'; })) {
      var f = (x - 94) / 188;
      return '8#孔 ' + (f * 8).toFixed(f * 8 % 1 ? 1 : 0) + '/8';
    }
    return 'x=' + x.toFixed(1) + ' m';
  }

  BA.LAYOUT = build();
  BA.BUILD_LAYOUT = build;
  BA.rebuildLayout = function () { BA.LAYOUT = build(); return BA.LAYOUT; };
  BA.GEO = GEO;
  BA.IND_COLOR = indColor;

  /* 导出的常量供其他模块使用 */
  BA.LAYOUT_IND = IND;

})(window);
