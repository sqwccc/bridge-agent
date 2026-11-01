/* ============================================================
   万福大桥结构健康监测智能体 · 算法内核
   数据来源：扬州万福大桥监测数据（QL_JC_JCD / JCSB / JCXYZ / SSJC）
   ============================================================ */
(function (global) {
  'use strict';

  var EMPTY = { devices: [], points: [], series: {}, thresholds: {}, indRanges: {}, meta: {} };
  var D = global.BRIDGE_DATA || EMPTY;
  var ENV_IND = { '温度': 1, '湿度': 1, '风速': 1, '风向': 1, '地震加速度': 1 };

  /* ---------- 物理量级校验区间（工程经验值，用于识别量纲/标定异常） ---------- */
  var PHYS = {
    '温度':      [-40, 85],
    '湿度':      [0, 100],
    '风速':      [0, 75],
    '风向':      [0, 360],
    '地震加速度': [0, 2],
    '位移':      [0, 600],
    '变形':      [0, 600],
    '应变':      [5, 3000],
    '裂缝':      [0, 3],
    '索力':      [10, 30000],
    '振动加速度': [0, 5],
    'XY倾角':    [0, 15],
    '转角':      [0, 0.05]
  };

  /* ---------- 构件编码字典 ---------- */
  var LOC_NAME = {
    G: { n: '主梁', sys: 'super' },
    T: { n: '桥塔', sys: 'sub' },
    P: { n: '桥墩', sys: 'sub' },
    C: { n: '吊索', sys: 'super' },   // 悬索桥缆索归上部结构（CJJ 99）
    E: { n: '伸缩缝', sys: 'deck' },
    A: { n: '锚碇', sys: 'sub' }
  };
  var SYS_NAME = {
    super: '上部结构（主梁、缆索）',
    sub: '下部结构（塔、墩、锚碇）',
    deck: '桥面系（伸缩缝、附属）',
    fr: '自振频率',
    ifc: '冲击系数'
  };
  /* 表 1 桥梁结构组成权重（文档原文） */
  var W_DOC = { deck: 0.172, super: 0.344, sub: 0.344, fr: 0.110, ifc: 0.030 };
  var SYS_ORDER = ['deck', 'super', 'sub'];

  /* ---------- 构件评分基线（2026 年度定检台账，CJJ 99-2017） ---------- */
  var BASE = { super: 90.2, sub: 91.5, deck: 88.1 };

  /* ---------- 效应比 → 通道评分 传递函数 ---------- */
  var TAU = [[0, 100], [0.4, 97], [0.6, 93], [0.8, 87], [0.9, 82], [1.0, 78], [1.2, 66], [1.5, 52], [2.0, 36], [2.5, 30]];
  function etaToScore(eta) {
    if (!isFinite(eta)) return null;
    if (eta <= 0) return 100;
    if (eta >= 2.5) return 30;
    for (var i = 0; i < TAU.length - 1; i++) {
      var a = TAU[i], b = TAU[i + 1];
      if (eta >= a[0] && eta <= b[0]) {
        var k = (eta - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return 30;
  }

  /* ============================================================
     表 2 / 表 3 · 监测指标健康度评分（线性内插）
     ============================================================ */
  // 表 2 自振频率：f_mi / f_di
  var FR_BANDS = [
    { lo: 1.10, hi: null, s0: 100, s1: 100, t: '= 1.10' },
    { lo: 1.00, hi: 1.10, s0: 80, s1: 100, t: '[1.00, 1.10)' },
    { lo: 0.90, hi: 1.00, s0: 60, s1: 80, t: '[0.90, 1.00)' },
    { lo: 0.80, hi: 0.90, s0: 40, s1: 60, t: '[0.80, 0.90)' },
    { lo: 0.75, hi: 0.80, s0: 0, s1: 40, t: '[0.75, 0.80)' }
  ];
  function frScore(r) {
    if (!isFinite(r) || r == null) return null;
    if (r >= 1.10) return 100;
    if (r >= 1.00) return 80 + (r - 1.00) / 0.10 * 20;
    if (r >= 0.90) return 60 + (r - 0.90) / 0.10 * 20;
    if (r >= 0.80) return 40 + (r - 0.80) / 0.10 * 20;
    if (r >= 0.75) return (r - 0.75) / 0.05 * 40;
    return 0;
  }
  // 表 3 冲击系数：μ_mi / μ_di（越大越差）
  var IF_BANDS = [
    { lo: null, hi: 0.95, s0: 100, s1: 100, t: '≤ 0.95' },
    { lo: 0.95, hi: 1.05, s0: 80, s1: 100, t: '(0.95, 1.05]' },
    { lo: 1.05, hi: 1.20, s0: 60, s1: 80, t: '(1.05, 1.20]' },
    { lo: 1.20, hi: 1.40, s0: 40, s1: 60, t: '(1.20, 1.40]' }
  ];
  function ifScore(r) {
    if (!isFinite(r) || r == null) return null;
    if (r <= 0.95) return 100;
    if (r <= 1.05) return 100 - (r - 0.95) / 0.10 * 20;
    if (r <= 1.20) return 80 - (r - 1.05) / 0.15 * 20;
    if (r <= 1.40) return 60 - (r - 1.20) / 0.20 * 20;
    // 文档只给 [0,40) 开区间，按同斜率（20 分/0.20）线性降至 0
    return Math.max(0, 40 - (r - 1.40) / 0.20 * 20);
  }

  function gradeOf(s) {
    if (s == null) return '-';
    if (s >= 90) return 'A';
    if (s >= 80) return 'B';
    if (s >= 66) return 'C';
    if (s >= 50) return 'D';
    return 'E';
  }
  var GRADE_NAME = { A: '完好', B: '良好', C: '合格', D: '不合格', E: '危险' };
  var GRADE_CLASS = { A: 'g-a', B: 'g-b', C: 'g-c', D: 'g-d', E: 'g-e' };

  /* 报警分级：不再使用跨指标的自造系数，改为「拿该测点自己的各级阈值逐级比对」。
     THR.watch 仅用于「关注」档（三级阈值的 0.8 倍），是可调的工程辅助线，不参与报警判定。 */
  var THR = { watch: 0.80 };

  /* 单个级别的阈值取用与有效性校验（退化区间/零宽区间视为无效） */
  function validLevel(th, k) {
    var t = th && th[String(k)];
    if (!t) return null;
    var lo = t[0], hi = t[1];
    if (lo == null && hi == null) return null;
    if (lo != null && hi != null && Math.abs(hi - lo) <= 1e-9) return null;
    var limit = Math.max(lo == null ? 0 : Math.abs(lo), hi == null ? 0 : Math.abs(hi));
    if (!(limit > 0)) return null;
    return { lvl: k, lo: lo, hi: hi, limit: limit };
  }

  /* 通道达到的最高报警级别：有几级判几级 */
  function levelOf(ch) {
    if (!ch || ch.qc !== 'ok') return 'na';
    var lv = ch.lv || {};
    if (lv[1] && ch.peak >= lv[1].limit) return 'l1';
    if (lv[2] && ch.peak >= lv[2].limit) return 'l2';
    if (lv[3] && ch.peak >= lv[3].limit) return 'l3';
    if (lv[3] && ch.peak >= lv[3].limit * THR.watch) return 'watch';
    return 'ok';
  }

  /* 兼容旧调用：仅按三级效应比给"关注/正常"，不再用于报警分级 */
  function statusOf(eta) {
    if (eta == null) return 'na';
    return eta >= THR.watch ? 'watch' : 'ok';
  }

  /* ---------- 索引（可随数据集切换重建） ---------- */
  var DEV = {}, PT = {};
  function indexData() {
    DEV = {}; PT = {};
    (D.devices || []).forEach(function (d) { DEV[d.id] = d; });
    (D.points || []).forEach(function (p) { PT[p.id] = p; });
    (D.devices || []).forEach(function (d) {
      var p = PT[d.id];
      d.pointName = p ? p.name : (d.pointName || '');
    });
  }
  indexData();

  /* 注入新数据集：Web 版从云端读取后调用 */
  function setData(nd) {
    D = nd || EMPTY;
    indexData();
  }

  function locOf(dev) { return dev.locCode || '--'; }
  function compName(dev) {
    var L = LOC_NAME[(dev.locCode || '-')[0]];
    return L ? L.n + ' ' + dev.locCode : '其他 ' + dev.locCode;
  }

  /* ============================================================
     A1 · 通道构建（阈值校验 + 量纲校验 + 效应比）
     ============================================================ */
  function pickThreshold(th) {
    if (!th) return null;
    var order = ['3', '2', '1'];
    for (var i = 0; i < order.length; i++) {
      var t = th[order[i]];
      if (!t) continue;
      var lo = t[0], hi = t[1];
      if (lo == null && hi == null) continue;
      if (lo != null && hi != null && hi - lo <= 1e-9) continue;
      return { lvl: order[i], lo: lo, hi: hi, src: order[i] === '3' ? 'own' : 'fallback' };
    }
    return null;
  }

  function buildChannels() {
    var list = [];
    Object.keys(D.series).forEach(function (id) {
      var dev = DEV[id];
      if (!dev) return;
      var pts = D.series[id];
      if (!pts || !pts.length) return;
      var vals = pts.map(function (p) { return p[1]; });
      var peak = 0, sum = 0;
      for (var i = 0; i < vals.length; i++) {
        var a = Math.abs(vals[i]);
        if (a > peak) peak = a;
        sum += vals[i];
      }
      var mean = sum / vals.length;
      var thr = pickThreshold(D.thresholds[id]);
      var ch = {
        id: id, dev: dev, ind: dev.ind, indName: dev.indName, unit: dev.unit,
        kind: dev.kind, locCode: locOf(dev), sys: dev.sys, comp: compName(dev),
        n: pts.length, times: pts.map(function (p) { return p[0]; }), vals: vals,
        peak: peak, mean: mean,
        t0: pts[0][0], t1: pts[pts.length - 1][0],
        thr: thr, isEnv: !!ENV_IND[dev.indName], qc: 'ok', qcNote: ''
      };

      // ① 物理量级校验
      var pr = PHYS[ch.indName];
      var physBad = false;
      if (pr) {
        if (ch.peak > pr[1] * 1.5 || (pr[0] > 0 && Math.abs(mean) < pr[0] * 0.4)) physBad = true;
      }

      var limit = thr ? Math.max(thr.lo == null ? 0 : Math.abs(thr.lo), thr.hi == null ? 0 : Math.abs(thr.hi)) : null;
      ch.limit = limit;
      ch.eta = (limit && limit > 0) ? peak / limit : null;
      ch.score = ch.isEnv ? null : (ch.eta == null ? null : etaToScore(ch.eta));

      if (!thr) { ch.qc = 'nothr'; ch.qcNote = '接入阈值表无有效阈值，未参与评分'; }
      if (physBad) {
        ch.qc = 'scale';
        ch.qcNote = '实测幅值 ' + fmt(ch.peak, 3) + ' ' + (ch.unit || '') + ' 偏离该指标物理量级区间 ['
          + pr[0] + ', ' + pr[1] + ']，疑似量纲/标定系数异常，不参与结构评分';
      }
      if (ch.n <= 2 && ch.qc === 'ok') { ch.qc = 'sparse'; ch.qcNote = '当期仅 ' + ch.n + ' 条报文，样本不足以判定'; }
      if (ch.isEnv) { ch.qc = 'env'; ch.qcNote = '环境量（' + ch.indName + '），作为温度/风效应输入，不参与结构评分'; }
      if (ch.thr && ch.thr.src === 'fallback') {
        ch.qcNote = (ch.qcNote ? ch.qcNote + '；' : '') + '三级阈值退化为零宽区间，已回退至' + ({ '2': '二级', '1': '一级' }[ch.thr.lvl]) + '阈值';
      }
      // 该测点实际拥有的各级阈值（1/2/3），用于逐级判定
      ch.lv = {};
      [1, 2, 3].forEach(function (k) {
        var v = validLevel(D.thresholds[id], k);
        if (v) ch.lv[k] = v;
      });
      ch.nLv = Object.keys(ch.lv).length;
      ch.level = levelOf(ch);
      ch.status = ch.level;
      list.push(ch);
    });
    list.sort(function (a, b) {
      var A = a.eta == null ? -1 : a.eta, B = b.eta == null ? -1 : b.eta;
      return B - A;
    });
    return list;
  }

  /* ============================================================
     A2 · 文档评分模型：Dr = m·BCI_m + s·BCI_s + x·BCI_x + D_IFR·D_MFR + D_IIF·D_MIF
     ============================================================ */
  var MGT_CLASSES = ['I', 'II', 'III', 'IV', 'V'];

  function assess(opt) {
    opt = opt || {};
    var W = Object.assign({}, W_DOC, opt.weights || {});
    var channels = buildChannels();
    var comps = {};

    channels.forEach(function (c) {
      var code = c.locCode;
      if (!comps[code]) {
        var L = LOC_NAME[(code || '-')[0]] || { n: '其他', sys: 'super' };
        comps[code] = {
          code: code, name: compName(c.dev), sys: L.sys, sysName: SYS_NAME[L.sys] || '其他',
          base: BASE[L.sys] || 88, channels: [], valid: [], ded: 0, score: null, eta: null,
          grade: '-', devCount: 0
        };
      }
      comps[code].channels.push(c);
      comps[code].devCount++;
    });

    var compList = Object.keys(comps).map(function (k) { return comps[k]; });

    compList.forEach(function (cp) {
      cp.valid = cp.channels.filter(function (c) { return c.qc === 'ok' && c.eta != null; });
      if (cp.valid.length) {
        var ded = 0;
        cp.valid.forEach(function (c) { if (c.eta > 0.8) ded += (c.eta - 0.8) * 6; });
        cp.ded = Math.min(12, ded);
        cp.score = Math.max(0, cp.base - cp.ded);
        cp.eta = Math.max.apply(null, cp.valid.map(function (c) { return c.eta; }));
        var sorted = cp.valid.slice().sort(function (a, b) { return b.eta - a.eta; });
        cp.worst = sorted[0];
        var overL2 = cp.valid.filter(function (c) { var L = levelOf(c); return L === 'l1' || L === 'l2'; }).length;
        cp.sysOver = cp.valid.length >= 4 && overL2 / cp.valid.length >= 0.5;
        cp.overL2 = overL2;
      } else {
        cp.score = cp.base;
        cp.eta = null;
        cp.nodata = true;
        cp.noDataReason = cp.channels.some(function (c) { return c.qc === 'scale'; })
          ? '通道量纲/标定待核查' : (cp.channels.some(function (c) { return c.qc === 'nothr'; }) ? '阈值缺失' : '无当期报文');
      }
      cp.grade = gradeOf(cp.score);
    });

    // 部位层：BCI_m / BSI_s / BSI_x
    var sys = {};
    SYS_ORDER.forEach(function (k) {
      var group = compList.filter(function (c) { return c.sys === k; });
      var withData = group.filter(function (c) { return !c.nodata; });
      var mean = null;
      if (group.length) {
        mean = group.reduce(function (a, c) { return a + c.score; }, 0) / group.length;
      }
      sys[k] = {
        key: k, name: SYS_NAME[k], w: W[k], n: group.length, nData: withData.length,
        comps: group, score: mean, min: withData.length ? Math.min.apply(null, withData.map(function (c) { return c.score; })) : null,
        eval: mean != null
      };
    });

    // 监测指标
    var rF = opt.frRatio == null ? 1.00 : opt.frRatio;
    var rI = opt.ifRatio == null ? 0.95 : opt.ifRatio;
    var dMFR = frScore(rF), dMIF = ifScore(rI);
    // frData / ifData 为 true 才算"有实测"，否则一律标注为假定值
    sys.fr = { key: 'fr', name: SYS_NAME.fr, w: W.fr, score: dMFR, ratio: rF, assumed: opt.frData !== true, eval: dMFR != null };
    sys.ifc = { key: 'ifc', name: SYS_NAME.ifc, w: W.ifc, score: dMIF, ratio: rI, assumed: opt.ifData !== true, eval: dMIF != null };

    // 式(1)
    var Dr = 0, wsum = 0;
    ['deck', 'super', 'sub', 'fr', 'ifc'].forEach(function (k) {
      if (sys[k].score != null) { Dr += W[k] * sys[k].score; wsum += W[k]; }
    });
    Dr = wsum > 0 ? Dr / wsum : null;

    // 收口：最终得分 = min(Dr, BCI*, BSI*)
    var BCI = sys.deck.score, BSI = sys.super.score;
    var finalScore = Dr;
    var minFrom = 'Dr';
    if (BCI != null && BCI < finalScore) { finalScore = BCI; minFrom = 'BCI*'; }
    if (BSI != null && BSI < finalScore) { finalScore = BSI; minFrom = 'BSI*'; }

    // 一票否决
    var veto = !!opt.veto;
    if (veto) { finalScore = Math.min(60, finalScore); }

    var grade = gradeOf(finalScore);

    var dist = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    compList.forEach(function (c) { if (c.grade !== '-') dist[c.grade]++; });

    var mgt = opt.mgt || 'I';
    return {
      channels: channels, comps: compList, sys: sys, W: W,
      Dr: Dr, BCI: BCI, BSI: BSI, finalScore: finalScore, minFrom: minFrom, veto: veto,
      total: finalScore, grade: grade,
      dist: dist, mgt: mgt, isClassI: mgt === 'I',
      worst: compList.slice().filter(function (c) { return !c.nodata; }).sort(function (a, b) { return a.score - b.score; })
    };
  }

  /* ---------- Ⅰ 类养护：评分之外，另给结构安全状况初判 ---------- */
  function classIJudge(ev) {
    var A2 = ev || assess({ mgt: 'I' });
    var AL = alarms(A2);
    var l1 = AL.filter(function (a) { return a.level === 1; });
    var l2 = AL.filter(function (a) { return a.level === 2; });
    var sysOver = A2.comps.filter(function (c) { return c.sysOver; });
    var pending = [];
    if (l1.length) pending.push(l1.length + ' 处一级报警待复核（' + uniq(l1.map(function (a) { return a.comp; })).join('、') + '）');
    if (l2.length) pending.push(l2.length + ' 处二级报警待复核（' + uniq(l2.map(function (a) { return a.comp; })).join('、') + '）');
    if (sysOver.length) pending.push(sysOver.length + ' 个构件呈系统性超限，阈值标定待复核（' + sysOver.map(function (c) { return c.code; }).join('、') + '）');
    var scale = A2.channels.filter(function (c) { return c.qc === 'scale'; });
    if (scale.length) pending.push(scale.length + ' 路通道数据待标定，索系等部位暂无有效实测');
    return {
      verdict: pending.length ? '待复核' : '合格',
      pass: false,
      pending: pending,
      basis: 'Ⅰ 类养护桥梁除按式(1) 计算 Dr 得分外，另按《养护标准》第 4.3 / 4.4 节做结构安全状况评估：'
        + '存在影响结构安全的损伤即判不合格。'
    };
  }
  function uniq(a) { var o = {}, r = []; a.forEach(function (x) { if (!o[x]) { o[x] = 1; r.push(x); } }); return r; }

  // 仅"检测指标"三项（BCI/BSI）的加权基线，用于对比参考
  var BASE_TOTAL = (function () {
    var s = 0, w = 0;
    ['deck', 'super', 'sub'].forEach(function (k) { s += W_DOC[k] * BASE[k]; w += W_DOC[k]; });
    return w > 0 ? s / w : 0;
  })();

  /* ============================================================
     A3 · 报警判定
     ============================================================ */
  function alarms(ev) {
    var A = ev || assess();
    var out = [];
    A.channels.forEach(function (c) {
      if (c.qc !== 'ok') return;
      var st = levelOf(c);
      if (st !== 'l1' && st !== 'l2' && st !== 'l3') return;
      var lv = st === 'l1' ? 1 : (st === 'l2' ? 2 : 3);
      var used = c.lv[lv];                      // 判定所依据的那一级阈值
      out.push({
        level: lv, levelName: lv === 1 ? '一级报警' : (lv === 2 ? '二级报警' : '三级预警'),
        id: c.id, comp: c.comp, compCode: c.locCode, indName: c.indName, unit: c.unit,
        peak: c.peak,
        limit: used.limit,                      // 该级阈值
        levelLimit: used.limit,
        eta: c.peak / used.limit,               // 相对该级阈值的效应比（≥1）
        eta3: c.eta,                            // 相对三级阈值的效应比（与评分口径一致）
        lvCount: c.nLv,                         // 该测点拥有的阈值级数
        t: c.t1,
        pointName: c.dev.pointName || c.id,
        sysOver: null
      });
    });
    // 标注系统性超限构件
    var sysOverMap = {};
    A.comps.forEach(function (cp) { if (cp.sysOver) sysOverMap[cp.code] = cp; });
    out.forEach(function (a) { if (sysOverMap[a.compCode]) a.sysOver = sysOverMap[a.compCode]; });
    out.sort(function (a, b) {
      if (a.level !== b.level) return a.level - b.level;   // 一级(1) 在前
      return (b.eta || 0) - (a.eta || 0);
    });
    return out;
  }

  /* ============================================================
     A4 · Pearson 相关矩阵
     ============================================================ */
  function pearson(x, y) {
    var n = Math.min(x.length, y.length);
    if (n < 3) return null;
    var sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
    var mx = sx / n, my = sy / n;
    for (i = 0; i < n; i++) {
      var dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (sxx <= 0 || syy <= 0) return null;
    return sxy / Math.sqrt(sxx * syy);
  }

  // 时间桶对齐：不同设备的报文时刻通常不重合，按 tol 窗口取均值后对齐
  function bucketize(series, tol) {
    var m = {}, out = [];
    series.forEach(function (p) {
      var k = Math.round(p[0] / tol);
      (m[k] = m[k] || []).push(p[1]);
    });
    Object.keys(m).forEach(function (k) {
      var arr = m[k];
      out.push([Number(k) * tol, arr.reduce(function (a, b) { return a + b; }, 0) / arr.length]);
    });
    out.sort(function (a, b) { return a[0] - b[0]; });
    return out;
  }
  function align(a, b, tolMs) {
    var tol = tolMs || 30 * 60 * 1000;
    var A2 = bucketize(a, tol), B2 = bucketize(b, tol);
    var m = {}, xs = [], ys = [];
    A2.forEach(function (p) { m[p[0]] = p[1]; });
    B2.forEach(function (p) { if (m[p[0]] !== undefined) { xs.push(m[p[0]]); ys.push(p[1]); } });
    return { x: xs, y: ys, n: xs.length };
  }

  function corrMatrix(chs, tol) {
    var ids = chs.map(function (c) { return c.id; });
    var mat = [];
    for (var i = 0; i < chs.length; i++) {
      mat.push([]);
      for (var j = 0; j < chs.length; j++) {
        if (i === j) { mat[i].push(1); continue; }
        var al = align(D.series[chs[i].id], D.series[chs[j].id], tol);
        mat[i].push(al.x.length >= 4 ? pearson(al.x, al.y) : null);
      }
    }
    return { ids: ids, labels: chs.map(function (c) { return c.dev.locCode + '·' + shortId(c.id); }), m: mat };
  }
  function shortId(id) { var p = String(id).split('-'); return p.slice(2).join('-'); }

  /* ============================================================
     A5 · 无监督状态编码 + 异常时间段识别（VG / N_ab / G_ab）
     ============================================================ */
  function detectAnomaly(series, opt) {
    opt = opt || {};
    var VG = opt.VG || 6;          // 状态颗粒度：分箱数，越小模式越多
    var Nab = opt.Nab || 3;        // 连续 N_ab 个异常状态判定为异常时间段
    var Gab = opt.Gab == null ? 1 : opt.Gab; // 允许间隔的正常状态数
    var vals = series.map(function (p) { return p[1]; });
    var n = vals.length;
    if (n < 5) return { points: [], states: [], segments: [], mu: 0, sd: 0, VG: VG, Nab: Nab, Gab: Gab, sigma: opt.sigma == null ? 2 : opt.sigma };

    var mu = vals.reduce(function (a, b) { return a + b; }, 0) / n;
    var sd = Math.sqrt(vals.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / n) || 1e-9;

    // 稳健标准化
    var z = vals.map(function (v) { return (v - mu) / sd; });

    // 分位分箱 → 状态码
    var sorted = vals.slice().sort(function (a, b) { return a - b; });
    var edges = [];
    for (var k = 1; k < VG; k++) edges.push(sorted[Math.floor(k * n / VG)]);

    var states = vals.map(function (v) {
      var s = 0;
      while (s < edges.length && v > edges[s]) s++;
      return s;
    });

    // 异常状态：稳健标准分 |z| 超过 sigma 阈值；极尾箱仅在 |z| 也偏大时确认
    var SIG = opt.sigma == null ? 2 : opt.sigma;
    var hist = new Array(VG).fill(0);
    states.forEach(function (s) { hist[s]++; });
    var abnormal = states.map(function (s, i) {
      var tail = (s === 0 || s === VG - 1) && hist[s] / n < 0.12;
      return Math.abs(z[i]) > SIG || (tail && Math.abs(z[i]) > SIG * 0.75);
    });

    // 合并：连续 Nab 个异常（允许 Gab 个正常间隔）
    var segments = [];
    var i = 0;
    while (i < n) {
      if (!abnormal[i]) { i++; continue; }
      var start = i, cnt = 1, last = i, j = i + 1, gap = 0;
      while (j < n) {
        if (abnormal[j]) { cnt++; last = j; gap = 0; j++; }
        else if (gap < Gab) { gap++; j++; }
        else break;
      }
      if (cnt >= Nab) {
        segments.push({
          startIdx: start, endIdx: last, count: cnt,
          t0: series[start][0], t1: series[last][0],
          peakZ: Math.max.apply(null, z.slice(start, last + 1).map(Math.abs))
        });
      }
      i = last + 1;
    }

    return {
      points: series, vals: vals, z: z, states: states, abnormal: abnormal,
      segments: segments, mu: mu, sd: sd, VG: VG, Nab: Nab, Gab: Gab, edges: edges, hist: hist, sigma: SIG
    };
  }

  /* ============================================================
     A6 · 索力频率法  T = 4 m L² f²
     ============================================================ */
  // 吊索几何：主跨 208 m，两塔中心距 208 m；吊索编号 C01..C13 沿半跨布置
  var MAIN_SPAN = 188, TOWER_H = 86.119, SADDLE_H = 62, CABLE_SAG_RATIO = 1 / 4.1;
  function cableGeom(idx, total) {
    // idx: 1..total，沿半跨从塔向跨中；SADDLE_H 为鞍座高出桥面的高度
    var x = (idx - 0.5) / total;
    var Lm = MAIN_SPAN / 2 * x;
    var sag = MAIN_SPAN * CABLE_SAG_RATIO;
    var ys = SADDLE_H - sag * (1 - Math.pow(1 - x, 2));
    return { L: Math.max(2, ys), x: Lm, y: ys };
  }
  function cableForce(m, L, f) { return 4 * m * L * L * f * f / 1000; }   // kN（m: kg/m, L: m, f: Hz）
  function cableFreq(T, m, L) { return Math.sqrt(T * 1000 / (4 * m * L * L)); }  // Hz，T 单位 kN

  /* ============================================================
     A7 · 温度效应回归
     ============================================================ */
  function linreg(x, y) {
    var n = Math.min(x.length, y.length);
    if (n < 3) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    for (var i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
    var mx = sx / n, my = sy / n;
    for (i = 0; i < n; i++) {
      sxx += (x[i] - mx) * (x[i] - mx);
      sxy += (x[i] - mx) * (y[i] - my);
      syy += (y[i] - my) * (y[i] - my);
    }
    if (sxx <= 1e-12) return null;
    var a = sxy / sxx, b = my - a * mx;
    var r2 = syy > 1e-12 ? (sxy * sxy) / (sxx * syy) : 0;
    return { a: a, b: b, r2: r2, r: sxy / Math.sqrt(sxx * syy || 1e-12), n: n, mx: mx, my: my };
  }

  /* ============================================================
     A8 · 趋势 / 增量建模
     ============================================================ */
  function trend(series, splitRatio) {
    var n = series.length;
    if (n < 6) return null;
    var cut = Math.max(3, Math.floor(n * (splitRatio || 0.5)));
    var a = series.slice(0, cut), b = series.slice(cut);
    var ma = mean(a.map(function (p) { return p[1]; }));
    var mb = mean(b.map(function (p) { return p[1]; }));
    var dur = (series[n - 1][0] - series[0][0]) / 3600000; // h
    var slope = dur > 0 ? (mb - ma) / dur : 0;
    return { mA: ma, mB: mb, delta: mb - ma, dur: dur, slope: slope, cutAt: series[cut][0], nA: a.length, nB: b.length };
  }
  function mean(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }



  /* ---------- 全桥综合状态序列：各通道稳健标准化后按整点聚合 ---------- */
  function compositeSeries(chs) {
    var buckets = {};
    chs.forEach(function (c) {
      var n = c.vals.length;
      if (n < 3) return;
      var mu = c.vals.reduce(function (a, b) { return a + b; }, 0) / n;
      var sd = Math.sqrt(c.vals.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / n) || 1e-9;
      c.times.forEach(function (t, i) {
        var k = Math.floor(t / 3600000);
        (buckets[k] = buckets[k] || []).push((c.vals[i] - mu) / sd);
      });
    });
    var out = [];
    Object.keys(buckets).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) {
      var z = buckets[k];
      out.push([k * 3600000, z.reduce(function (a, b) { return a + b; }, 0) / z.length]);
    });
    return out;
  }

  /* ---------- 指标级阈值范围（当测点级阈值缺失时引用） ---------- */
  function indThresholdRange(indCode, bridgeOnly) {
    var R = D.indRanges && D.indRanges[indCode];
    if (!R) return null;
    var sc = bridgeOnly ? R.own : R.all;
    if (!sc || !sc.n) return null;
    return { lo: sc.lo, hi: sc.hi, n: sc.n, own: !!sc.own };
  }

  /* ---------- 工具 ---------- */
  function fmt(v, d) {
    if (v == null || !isFinite(v)) return '—';
    if (d == null) d = 2;
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.abs(v) >= 100) return v.toFixed(Math.min(1, d));
    return v.toFixed(d);
  }
  function timeStr(ts) {
    var d = new Date(ts);
    function p(x) { return x < 10 ? '0' + x : x; }
    return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function timeFull(ts) {
    var d = new Date(ts);
    function p(x) { return x < 10 ? '0' + x : x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  global.BA = {
    BASE: BASE, BASE_TOTAL: BASE_TOTAL, W_DOC: W_DOC, SYS_NAME: SYS_NAME,
    SYS_ORDER: SYS_ORDER, MGT_CLASSES: MGT_CLASSES,
    ENV_IND: ENV_IND, PHYS: PHYS, TAU: TAU, FR_BANDS: FR_BANDS, IF_BANDS: IF_BANDS,
    THR: THR, validLevel: validLevel, levelOf: levelOf,
    etaToScore: etaToScore, gradeOf: gradeOf, statusOf: statusOf,
    frScore: frScore, ifScore: ifScore, classIJudge: classIJudge,
    GRADE_NAME: GRADE_NAME, GRADE_CLASS: GRADE_CLASS,
    assess: assess, alarms: alarms, buildChannels: buildChannels,
    pearson: pearson, corrMatrix: corrMatrix, align: align, bucketize: bucketize, compositeSeries: compositeSeries,
    detectAnomaly: detectAnomaly, cableGeom: cableGeom, cableForce: cableForce, cableFreq: cableFreq,
    linreg: linreg, trend: trend, mean: mean, indThresholdRange: indThresholdRange,
    fmt: fmt, timeStr: timeStr, timeFull: timeFull, shortId: shortId,
    setData: setData, index: function () { return { DEV: DEV, PT: PT }; },
    MAIN_SPAN: MAIN_SPAN, TOWER_H: TOWER_H
  };

  ['D', 'DEV', 'PT'].forEach(function (k) {
    Object.defineProperty(global.BA, k, { get: function () { return k === 'D' ? D : (k === 'DEV' ? DEV : PT); } });
  });
})(window);
