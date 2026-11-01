/* ============================================================
   算法引擎弹层：A1–A8
   ============================================================ */
(function (global) {
  'use strict';
  var A, AL;
  var cur = 'score';
  var ST = { corrInd: '位移', anomId: null, tempComp: null, trendId: null };

  var ALGO_META = {
    score: { title: 'A1 · 总体技术状况评分 Dr', sub: '式(1) 五项加权 + 表2/表3 监测指标 ｜ 最终取 min(Dr, BCI*, BSI*)' },
    threshold: { title: 'A2 · 阈值分级报警判定', sub: '三级 / 二级 / 一级 双参数判据 + 系统性超限识别' },
    corr: { title: 'A3 · 通道相关性筛查', sub: 'Pearson 相关矩阵 ｜ 传感器数据质量前置校验' },
    anomaly: { title: 'A4 · 无监督状态编码异常识别', sub: 'VG 颗粒度 + N_ab / G_ab 判据 ｜ 自动圈定异常时间段' },
    cable: { title: 'A5 · 索力频率法', sub: 'T = 4 m L² f² ｜ 振动法索力测试与阈值比对' },
    temp: { title: 'A6 · 温度效应分离', sub: '一元线性回归 y = aT + b ｜ 扣除温度基线提取结构残差' },
    trend: { title: 'A7 · 增量建模与生命周期趋势', sub: '分段基线 + 漂移速率 ｜ 跨时段数据拼接建模' },
    vib: { title: 'V1 · 振动分析', sub: '振动数据通道 · 峰值时程 / 幅值排序 / 同断面一致性 / 逐通道初判' },
    rules: { title: 'A8 · 判定规则集与规范依据', sub: '技术状况等级 · 报警分级 · 数据质量判据' },
    plan: { title: '监测点布置图', sub: '立面（纵向）布置 · 标准横断面 · 测点统计｜主桥 (94+188+94) m' },
    report: { title: '监测日报', sub: '按当期实测数据生成 A4 版式报告｜可打印 / 导出 PDF' }
  };

  function CW() {
    var m = document.getElementById('mMain');
    return Math.max(420, (m ? m.clientWidth : 700) - 46);
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function n(v, d) { return BA.fmt(v, d); }
  function pct(v, d) { return (v * 100).toFixed(d == null ? 0 : d) + '%'; }
  function gc(g) { return UI.GRADE_COLOR[g] || '#63839f'; }

  /* ---------- 通用小工具 ---------- */
  function kvs(items) {
    return '<div class="kv-grid">' + items.map(function (i) {
      return '<div class="kv' + (i.cls ? ' ' + i.cls : '') + '"><div class="k">' + i.k + '</div><div class="v">' + i.v
        + (i.u ? '<small>' + i.u + '</small>' : '') + '</div></div>';
    }).join('') + '</div>';
  }
  function formula(lines) {
    return '<div class="formula">' + lines.join('<br>') + '</div>';
  }
  function chartWrap(svg, legend) {
    var d = document.createElement('div');
    d.className = 'chart-box';
    d.appendChild(svg);
    if (legend) {
      var lg = document.createElement('div');
      lg.className = 'legend-row';
      lg.innerHTML = legend.map(function (l) { return '<span><i style="background:' + l.c + '"></i>' + l.t + '</span>'; }).join('');
      d.appendChild(lg);
    }
    return d;
  }

  /* ============================================================
     A1 文档评分模型
     ============================================================ */
  var W1 = null, R1 = null;
  function scoreColor(v) {
    if (v >= 90) return '#3adc9b';
    if (v >= 80) return '#38d9f5';
    if (v >= 66) return '#ffc251';
    if (v >= 50) return '#ff9351';
    return '#ff5f6d';
  }

  /* 带状标尺：把表2/表3 的分档画成色带 + 当前比值指针 */
  function bandChart(bands, ratio, score, dom, label) {
    var w = CW(), h = 92, padL = 8, padR = 8, top = 16, bh = 26;
    var svg = CH.el('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none' });
    svg.style.width = '100%'; svg.style.height = h + 'px';
    var iw = w - padL - padR;
    function X(v) { return padL + (v - dom[0]) / (dom[1] - dom[0]) * iw; }

    // 两端"归零区"先铺底（分值 0 的暗红），再由分档色带覆盖
    var segs = [];
    var los = bands.map(function (b) { return b.lo; }).filter(function (v) { return v != null; });
    var his = bands.map(function (b) { return b.hi; }).filter(function (v) { return v != null; });
    var lo0 = los.length ? Math.min.apply(null, los) : dom[0];
    var hi1 = his.length ? Math.max.apply(null, his) : dom[1];
    if (lo0 > dom[0]) segs.push({ lo: dom[0], hi: lo0, c: scoreColor(0) });
    if (hi1 < dom[1]) segs.push({ lo: hi1, hi: dom[1], c: scoreColor(0) });
    bands.forEach(function (b) {
      var lo = b.lo == null ? dom[0] : b.lo;
      var hi = b.hi == null ? dom[1] : b.hi;
      lo = Math.max(dom[0], lo); hi = Math.min(dom[1], hi);
      if (hi <= lo) return;
      segs.push({ lo: lo, hi: hi, c: scoreColor((b.s0 + b.s1) / 2) });
    });
    segs.forEach(function (sg) {
      CH.el('rect', { x: X(sg.lo), y: top, width: Math.max(1, X(sg.hi) - X(sg.lo)), height: bh, fill: sg.c, opacity: .82 }, svg);
    });
    bands.forEach(function (b) {
      var lo = b.lo == null ? dom[0] : Math.max(dom[0], b.lo);
      var hi = b.hi == null ? dom[1] : Math.min(dom[1], b.hi);
      if (hi <= lo) return;
      var cx = (X(lo) + X(hi)) / 2;
      if (X(hi) - X(lo) < 22) return;
      svg.appendChild(CH.T(cx, top + bh - 8, b.s0 + '~' + b.s1, { 'text-anchor': 'middle', 'font-size': 8.5, fill: 'rgba(4,18,32,.72)', 'font-family': 'Consolas,monospace' }));
    });
    // 刻度
    var ticks = 5;
    for (var i = 0; i <= ticks; i++) {
      var v = dom[0] + (dom[1] - dom[0]) * i / ticks;
      CH.el('line', { x1: X(v), x2: X(v), y1: top + bh, y2: top + bh + 4, stroke: 'rgba(86,175,255,.35)' }, svg);
      svg.appendChild(CH.T(X(v), top + bh + 15, v.toFixed(2), { 'text-anchor': 'middle', 'font-size': 9 }));
    }
    // 指针
    var xr = X(Math.max(dom[0], Math.min(dom[1], ratio)));
    CH.el('line', { x1: xr, x2: xr, y1: top - 6, y2: top + bh + 2, stroke: '#fff', 'stroke-width': 1.6 }, svg);
    CH.el('circle', { cx: xr, cy: top + bh / 2, r: 4, fill: '#fff', stroke: scoreColor(score), 'stroke-width': 2 }, svg);
    svg.appendChild(CH.T(xr, top - 8, ratio.toFixed(2) + ' → ' + score.toFixed(1) + ' 分', { 'text-anchor': 'middle', 'font-size': 9.5, fill: '#ffffff', 'font-family': 'Microsoft YaHei' }));
    svg.appendChild(CH.T(padL, h - 4, label, { 'font-size': 9, fill: '#63839f', 'font-family': 'Microsoft YaHei' }));
    return svg;
  }

  function renderScore(root) {
    if (!W1) W1 = Object.assign({}, BA.W_DOC);
    R1 = { fr: 1.00, ifc: 0.95, veto: false };
    if (UI.ST) { R1.fr = UI.ST.frRatio; R1.ifc = UI.ST.ifRatio; }

    function calc() {
      return BA.assess({ weights: W1, frRatio: R1.fr, ifRatio: R1.ifc, veto: R1.veto, mgt: UI.ST.mgt });
    }

    root.innerHTML = formula([
      'D<sub>r</sub> = m·BCI<sub>m</sub> + s·BCI<sub>s</sub> + x·BCI<sub>x</sub> + D<sub>IFR</sub>·D<sub>MFR</sub> + D<sub>IIF</sub>·D<sub>MIF</sub>',
      '<span class="cm">m / s / x —— 桥面系 / 上部结构 / 下部结构权重；D<sub>MFR</sub> 自振频率评分；D<sub>MIF</sub> 冲击系数评分（按表 1 取值）</span>',
      '<span class="cm">最终得分 = min( Dr , BCI* , BSI* )；命中 4.5.9 情形或存在影响结构安全的损伤 → 直接判不合格 / ≤60 分</span>'
    ]);

    // ---- 结果区 ----
    var res = document.createElement('div');
    root.appendChild(res);
    // ---- 权重 ----
    var wt = document.createElement('div');
    root.appendChild(wt);
    // ---- 表2/表3 ----
    var mon = document.createElement('div');
    root.appendChild(mon);
    // ---- 收口 ----
    var fin = document.createElement('div');
    root.appendChild(fin);
    // ---- 构件表 ----
    var tbl = document.createElement('div');
    root.appendChild(tbl);

    function draw() {
      var A1 = calc();
      var col = scoreColor(A1.finalScore);

      res.innerHTML = kvs([
        { k: '最终得分', v: A1.finalScore.toFixed(1), cls: 'accent' },
        { k: '等级', v: '<span style="color:' + col + '">' + A1.grade + ' · ' + BA.GRADE_NAME[A1.grade] + '</span>' },
        { k: 'Dr 总体评分', v: A1.Dr.toFixed(1) },
        { k: 'BCI* 桥面系', v: A1.BCI == null ? '—' : A1.BCI.toFixed(1) },
        { k: 'BSI* 上部结构', v: A1.BSI == null ? '—' : A1.BSI.toFixed(1) },
        { k: '最终取值', v: A1.veto ? '一票否决' : A1.minFrom, cls: A1.veto ? 'bad' : '' }
      ]);

      // 权重滑块
      var wsum = ['deck', 'super', 'sub', 'fr', 'ifc'].reduce(function (a, k) { return a + W1[k]; }, 0);
      var names = { deck: '桥面系', super: '上部结构', sub: '下部结构', fr: '自振频率', ifc: '冲击系数' };
      wt.innerHTML = '<div class="sec-title">表 1 桥梁结构组成权重（可调，当前合计 ' + (wsum * 100).toFixed(1) + '%）</div>'
        + '<div class="ctrl-row">' + ['super', 'sub', 'deck', 'fr', 'ifc'].map(function (k) {
          return '<div class="ctrl"><label>' + names[k] + '</label>'
            + '<input type="range" min="0" max="60" step="1" value="' + Math.round(W1[k] * 100) + '" data-w="' + k + '">'
            + '<span class="rv" id="w1_' + k + '">' + (W1[k] * 100).toFixed(1) + '%</span></div>';
        }).join('') + '</div>'
        + '<div style="font-size:10.5px;color:#63839f;margin:-4px 0 10px">文档原值：上部 0.344 · 下部 0.344 · 桥面系 0.172 · 自振频率 0.110 · 冲击系数 0.030（合计 1.000）'
        + '　<span id="wReset" style="color:#38d9f5;cursor:pointer;text-decoration:underline">恢复文档原值</span></div>';
      wt.querySelectorAll('input[type=range]').forEach(function (r) {
        r.oninput = function () {
          W1[r.getAttribute('data-w')] = parseInt(r.value, 10) / 100;
          draw();
        };
      });
      var rst = document.getElementById('wReset');
      if (rst) rst.onclick = function () { W1 = Object.assign({}, BA.W_DOC); draw(); };

      // 监测指标
      mon.innerHTML = '<div class="sec-title">表 2 自振频率指标评分（D<sub>MFR</sub>，权重 ' + (W1.fr * 100).toFixed(1) + '%）</div>'
        + '<div class="ctrl-row">'
        + '<div class="ctrl"><label>f<sub>mi</sub> / f<sub>di</sub></label><input type="number" id="rFr" step="0.01" min="0.5" max="1.5" value="' + R1.fr.toFixed(2) + '"></div>'
        + '<div class="ctrl"><span class="rv" id="sFr" style="min-width:62px">' + A1.sys.fr.score.toFixed(1) + ' 分</span></div>'
        + '<div style="font-size:10.5px;color:#63839f">f<sub>mi</sub> 实测自振频率均值，f<sub>di</sub> 理论自振频率</div>'
        + '</div>';
      var bc1 = document.createElement('div');
      bc1.className = 'chart-box';
      bc1.appendChild(bandChart(BA.FR_BANDS, R1.fr, A1.sys.fr.score, [0.70, 1.15], '自振频率比值 → 健康度评分（表 2 线性内插）'));
      mon.appendChild(bc1);

      var t3 = document.createElement('div');
      t3.innerHTML = '<div class="sec-title">表 3 冲击系数指标评分（D<sub>MIF</sub>，权重 ' + (W1.ifc * 100).toFixed(1) + '%）</div>'
        + '<div class="ctrl-row">'
        + '<div class="ctrl"><label>μ<sub>mi</sub> / μ<sub>di</sub></label><input type="number" id="rIf" step="0.01" min="0.5" max="2.2" value="' + R1.ifc.toFixed(2) + '"></div>'
        + '<div class="ctrl"><span class="rv" id="sIf" style="min-width:62px">' + A1.sys.ifc.score.toFixed(1) + ' 分</span></div>'
        + '<div style="font-size:10.5px;color:#63839f">比值越小越好；>1.40 段文档只给 [0,40) 开区间，此处按同斜率线性降至 0</div>'
        + '</div>';
      mon.appendChild(t3);
      var bc2 = document.createElement('div');
      bc2.className = 'chart-box';
      bc2.appendChild(bandChart(BA.IF_BANDS, R1.ifc, A1.sys.ifc.score, [0.85, 1.60], '冲击系数比值 → 健康度评分（表 3 线性内插）'));
      mon.appendChild(bc2);
      if (A1.sys.fr.assumed || A1.sys.ifc.assumed) {
        var nb = document.createElement('div');
        nb.className = 'note-box';
        nb.innerHTML = '<b>数据缺口</b>：表 2 / 表 3 需要「车辆过桥工况余振」下识别的自振频率与冲击系数，'
          + '当期监测报文里没有该两项统计量（只有振动加速度、位移、应变的原始序列，且为小时级粒度）。'
          + '当前' + (A1.sys.fr.assumed ? ' 自振频率取 1.00' : '') + (A1.sys.ifc.assumed ? '、冲击系数取 0.95' : '')
          + ' 为假定值，用于当前参数计算，正式评定须接入实测或人工录入。';
        mon.appendChild(nb);
      }

      mon.querySelectorAll('input[type=number]').forEach(function (inp) {
        inp.oninput = function () {
          var v = parseFloat(inp.value);
          if (!isFinite(v)) return;
          if (inp.id === 'rFr') R1.fr = v; else R1.ifc = v;
          draw();
        };
      });

      // 收口
      var cant = [
        { n: 'Dr 总体评分', v: A1.Dr, c: '#38d9f5' },
        { n: 'BCI* 桥面系', v: A1.BCI, c: '#3adc9b' },
        { n: 'BSI* 上部结构', v: A1.BSI, c: '#ffc251' }
      ];
      fin.innerHTML = '<div class="sec-title">收口规则：最终得分 = min(Dr, BCI*, BSI*)</div>'
        + '<div class="chart-box" id="finBars"></div>'
        + '<div class="ctrl-row"><div class="ctrl"><label><input type="checkbox" id="vetoChk"' + (R1.veto ? ' checked' : '')
        + ' style="accent-color:#ff5f6d;vertical-align:-2px"> 命中《养护标准》4.5.9 情形 / 存在影响结构安全的损伤（一票否决）</label></div></div>'
        + '<div class="note-box info"><b>口径提醒：</b>文档规定「还应按照养护标准对 BCI*、BSI* 进行评分，并取其中的最小值作为最终得分」。'
        + '因此本页的最终得分常常由<b>最差部位</b>控制，而不是 Dr 均值——当出现某个部位明显偏低时，'
        + 'Dr 再高也不会成为最终得分。</div>';
      var fb = document.getElementById('finBars');
      if (fb) {
        fb.appendChild(CH.hbars({
          w: CW() - 20, rowH: 24, labelW: 118,
          items: cant.map(function (it) {
            var has = it.v != null && isFinite(it.v);
            var isMin = has && Math.abs(it.v - A1.finalScore) < 0.05 && !A1.veto;
            return {
              name: it.n, value: has ? it.v : 0, max: 100,
              color: isMin ? '#ff5f6d' : it.c,
              text: (has ? it.v.toFixed(1) : '—') + (isMin ? '  ← 最终' : '')
            };
          })
        }));
      }
      var vc = document.getElementById('vetoChk');
      if (vc) vc.onchange = function () { R1.veto = this.checked; draw(); };

      // 构件表
      tbl.innerHTML = '<div class="sec-title" style="margin-top:14px">构件评分明细（按健康度升序）</div>'
        + '<table class="dt"><thead><tr><th>构件</th><th>部位</th><th class="mono">定检基线</th><th class="mono">监测修正</th>'
        + '<th class="mono">当前计算分</th><th>等级</th><th class="mono">有效/总通道</th><th class="mono">最不利 η</th></tr></thead><tbody>'
        + A1.comps.slice().sort(function (a, b) { return a.score - b.score; }).map(function (c) {
          return '<tr><td><b>' + esc(c.name) + '</b></td><td>' + esc(c.sysName.split('（')[0]) + '</td>'
            + '<td class="mono">' + c.base.toFixed(1) + '</td>'
            + '<td class="mono" style="color:' + (c.ded > 0 ? '#ff9351' : '#3adc9b') + '">' + (c.ded > 0 ? '−' + c.ded.toFixed(1) : '0.0') + '</td>'
            + '<td class="mono" style="color:' + scoreColor(c.score) + ';font-weight:700">' + c.score.toFixed(1) + '</td>'
            + '<td style="color:' + scoreColor(c.score) + '">' + c.grade + '</td>'
            + '<td class="mono">' + c.valid.length + '/' + c.channels.length + '</td>'
            + '<td class="mono">' + (c.eta == null ? '<span style="color:#63839f">待标定</span>' : c.eta.toFixed(2)) + '</td></tr>';
        }).join('') + '</tbody></table>'
        + '<div class="prose"><b>构件分怎么来的：</b>文档只规定到 BCI/BSI 层，构件层需按《养护标准》§4.5 逐级加权。'
        + '本页采用：通道效应比 η → 通道分 f(η) → 构件分 = 定检基线 − min(12, Σ6·max(0, η−0.8))，'
        + '部位分 = 构件分算术平均。定检基线 上部 90.2 / 下部 91.5 / 桥面系 88.1 为台账值，'
        + '若与本桥实际定检报告不一致，需替换 <code>core.js</code> 中的 <code>BASE</code>。</div>';
    }

    draw();

    // 应用到全桥
    var bar = document.createElement('div');
    bar.className = 'ctrl-row';
    bar.style.margin = '4px 0 12px';
    bar.innerHTML = '<button class="ci-btn" id="applyAll">应用比值与否决条件到本页分析</button>'
      + '<span style="font-size:10.5px;color:#63839f;align-self:center">仅更新本页分析，不写入系统档案</span>';
    root.insertBefore(bar, res);
    var ap = document.getElementById('applyAll');
    if (ap) ap.onclick = function () {
      UI.ST.frRatio = R1.fr;
      UI.ST.ifRatio = R1.ifc;
      UI.ST.veto = R1.veto;
      UI.reassess();
      UI.toast('已应用到本页分析');
    };
  }

  /* ============================================================
     A2 阈值分级
     ============================================================ */
  function renderThreshold(root) {
    var T = BA.THR;
    var chs = A.channels.filter(function (c) { return c.qc === 'ok'; });
    var byLv = { l1: 0, l2: 0, l3: 0, watch: 0, ok: 0, na: 0 };
    chs.forEach(function (c) { var k = BA.levelOf(c); if (byLv[k] != null) byLv[k]++; });

    // 阈值配置覆盖情况
    var cover = { 0: 0, 1: 0, 2: 0, 3: 0 };
    A.channels.forEach(function (c) { cover[c.nLv || 0] = (cover[c.nLv || 0] || 0) + 1; });

    root.innerHTML = formula([
      '判定：η<sub>i</sub> = |x|<sub>max</sub> / L<sub>i</sub>，i = 3, 2, 1 &nbsp;→&nbsp; η<sub>i</sub> ≥ 1 即达到第 i 级',
      '<span class="cm">每级用该测点自己的阈值：达到三级阈值判三级、达到二级判二级、达到一级判一级；按最高达到的级别定性</span>',
      '<span class="cm">缺哪一级就判不到哪一级（不推定）；阈值退化为零宽区间（上下限相等）视为该级无效</span>',
      '<span class="cm">关注档：' + T.watch.toFixed(2) + ' × 三级阈值，仅记录不报警（工程辅助线，可调）</span>'
    ]);

    var note = document.createElement('div');
    note.className = 'note-box';
    note.innerHTML = '<b>分级依据：用表内阈值逐级比对，不再使用跨指标的自造系数。</b><br>'
      + '· 规范对监测预警确有要求：GB 50982-2014 第 3.1.8 条（强制）"应设定监测预警值"；'
      + 'JT/T 1037-2016 第 8.3 节设黄/红两级，并给出分项倍率（位移、变形 0.8 倍设计值起报；索应力 0.95 倍；车辆荷载 1.5/2.0 倍；风速 0.8/1.0 倍；冲刷 0.7 倍）。<br>'
      + '· 规范给的是「相对设计值/控制值的倍率」，按监测项分别规定，<b>没有跨指标的通用系数</b>，所以不使用 1.0/1.2/1.5 之类做法。<br>'
      + '· 本期数据里，各测点实际配置的阈值级数见下表。缺级即不推定，避免把"没有一级阈值"的测点误报成一级报警。'
      + '<br>· 若按 JT/T 1037 重做，仍需以本桥设计文件中的位移、索力、应变等设计值为基准，本表暂以接入阈值表为准。';
    root.appendChild(note);

    // 阈值配置覆盖
    var cov = document.createElement('div');
    cov.innerHTML = '<div class="sec-title">阈值配置覆盖情况（全部 ' + A.channels.length + ' 路通道）</div>'
      + '<div class="kv-grid" style="margin-bottom:6px">'
      + '<div class="kv"><div class="k">三级齐全</div><div class="v" style="color:' + (cover[3] ? '#3adc9b' : '#ffc251') + '">' + cover[3] + '<small>路</small></div></div>'
      + '<div class="kv"><div class="k">仅 2 级阈值</div><div class="v">' + cover[2] + '<small>路</small></div></div>'
      + '<div class="kv"><div class="k">仅 1 级阈值</div><div class="v">' + cover[1] + '<small>路</small></div></div>'
      + '<div class="kv"><div class="k">无有效阈值</div><div class="v" style="color:' + (cover[0] ? '#ff9351' : '#3adc9b') + '">' + cover[0] + '<small>路</small></div></div>'
      + '</div>'
      + (cover[3] === 0
        ? '<div class="note-box" style="margin-top:0"><b>注意：没有任何一路通道配齐三级阈值。</b>'
          + '因此本期不可能出现"一级报警"——出现即说明判定逻辑在用推定值，需排查。'
          + '建议向监测单位补录各级阈值，或按设计控制值重建阈值表。</div>'
        : '');
    root.appendChild(cov);

    root.insertAdjacentHTML('beforeend', kvs([
      { k: '一级报警', v: byLv.l1, u: '路', cls: byLv.l1 ? 'bad' : '' },
      { k: '二级报警', v: byLv.l2, u: '路', cls: byLv.l2 ? 'warn' : '' },
      { k: '三级预警', v: byLv.l3, u: '路', cls: byLv.l3 ? 'warn' : '' },
      { k: '关注', v: byLv.watch, u: '路' },
      { k: '正常', v: byLv.ok, u: '路' },
      { k: '参与判定', v: chs.length, u: '路' }
    ]));

    // 关注档可调
    var ctrl = document.createElement('div');
    ctrl.className = 'ctrl-row';
    ctrl.innerHTML = '<div class="ctrl"><label>关注档系数（×三级阈值）</label>'
      + '<input type="number" id="thW" step="0.05" min="0.1" max="1" value="' + T.watch.toFixed(2) + '"></div>'
      + '<div class="ctrl"><span id="thReset" style="color:#38d9f5;cursor:pointer;text-decoration:underline;font-size:11px">恢复默认 0.80</span></div>';
    root.appendChild(ctrl);
    var applyW = function () {
      var w = parseFloat(document.getElementById('thW').value);
      if (!isFinite(w) || w <= 0 || w > 1) { UI.toast('系数应在 (0, 1] 之间'); return; }
      UI.ST.thr = { watch: w };
      UI.reassess();
      open('threshold');
    };
    var ew = document.getElementById('thW');
    if (ew) ew.onchange = applyW;
    var rs = document.getElementById('thReset');
    if (rs) rs.onclick = function () { UI.ST.thr = { watch: 0.80 }; UI.reassess(); open('threshold'); };

    // 效应比分布（相对三级阈值，与评分口径一致）
    var ech = chs.filter(function (c) { return c.eta != null; });
    var bins = [{ lo: 0, hi: 0.2 }, { lo: 0.2, hi: 0.4 }, { lo: 0.4, hi: 0.6 }, { lo: 0.6, hi: 0.8 }, { lo: 0.8, hi: 1.0 }, { lo: 1.0, hi: 1.2 }, { lo: 1.2, hi: 1.5 }, { lo: 1.5, hi: 99 }];
    var counts = bins.map(function (b) {
      return ech.filter(function (c) { return c.eta >= b.lo && c.eta < b.hi; }).length;
    });
    var maxC = Math.max.apply(null, counts.concat([1]));
    var svg = CH.el('svg', { viewBox: '0 0 ' + CW() + ' 180', preserveAspectRatio: 'none' });
    svg.style.height = '180px'; svg.style.width = '100%';
    var bw = CW() / bins.length;
    var base = 146;
    bins.forEach(function (b, i) {
      var hh = counts[i] / maxC * 112;
      var col = b.lo >= 1.5 ? '#ff5f6d' : b.lo >= 1.2 ? '#ff9351' : b.lo >= 1.0 ? '#ffc251' : b.lo >= 0.8 ? '#5fd0e8' : '#38d9f5';
      CH.el('rect', { x: i * bw + bw * 0.26, y: base - hh, width: bw * 0.48, height: Math.max(1, hh), fill: col, opacity: .88, rx: 2 }, svg);
      svg.appendChild(CH.T(i * bw + bw / 2, base + 16, (b.hi === 99 ? '≥1.5' : b.lo.toFixed(1) + '–' + b.hi.toFixed(1)), { 'text-anchor': 'middle', 'font-size': 9.5 }));
      if (counts[i]) svg.appendChild(CH.T(i * bw + bw / 2, base - hh - 6, counts[i], { 'text-anchor': 'middle', 'font-size': 10, fill: col }));
    });
    CH.el('line', { x1: 0, y1: base, x2: CW(), y2: base, stroke: 'rgba(120,175,215,.35)' }, svg);
    svg.appendChild(CH.T(2, 12, '通道数（η 相对三级阈值）', { 'font-size': 9.5, fill: '#63839f' }));
    root.appendChild(chartWrap(svg, [{ c: '#38d9f5', t: 'η&lt;0.8' }, { c: '#5fd0e8', t: '0.8–1.0' }, { c: '#ffc251', t: '1.0–1.2' }, { c: '#ff9351', t: '1.2–1.5' }, { c: '#ff5f6d', t: '≥1.5' }]));

    // 报警清单
    var AL = BA.alarms(A);
    var t = document.createElement('div');
    t.innerHTML = '<div class="sec-title">超限通道清单（按级别、η 降序）</div>'
      + (AL.length ? '<table class="dt"><thead><tr><th>级别</th><th>构件</th><th>测点</th><th>指标</th>'
        + '<th class="mono">实测峰值</th><th class="mono">判定阈值</th><th class="mono">η<sub>该级</sub></th><th class="mono">η<sub>三级</sub></th><th class="mono">已有级数</th><th>点位</th></tr></thead><tbody>'
        + AL.map(function (a) {
          return '<tr><td style="color:' + (a.level === 1 ? '#ff5f6d' : a.level === 2 ? '#ff9351' : '#ffc251') + ';font-weight:700">' + a.levelName + '</td>'
            + '<td>' + esc(a.comp) + '</td><td class="mono" style="font-size:10px">' + esc(BA.shortId(a.id)) + '</td>'
            + '<td>' + esc(a.indName) + '</td><td class="mono">' + n(a.peak, 2) + a.unit + '</td>'
            + '<td class="mono">' + n(a.limit, 1) + a.unit + '</td>'
            + '<td class="mono" style="color:#ff9351;font-weight:700">' + a.eta.toFixed(2) + '</td>'
            + '<td class="mono">' + (a.eta3 == null ? '—' : a.eta3.toFixed(2)) + '</td>'
            + '<td class="mono' + (a.lvCount < 2 ? '" style="color:#ffc251' : '') + '">' + a.lvCount + ' 级</td>'
            + '<td style="font-size:10px;color:#8fb0c9">' + esc(a.pointName) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<div class="empty-tip">无超限通道</div>');
    root.appendChild(t);

    var sys = A.comps.filter(function (c) { return c.sysOver; });
    if (sys.length) {
      var nb = document.createElement('div');
      nb.className = 'note-box';
      nb.innerHTML = '<b>系统性超限识别</b><br>' + sys.map(function (c) {
        return '· <b>' + esc(c.name) + '</b>：' + c.overL2 + '/' + c.valid.length + ' 路通道达到二级及以上（' + pct(c.overL2 / c.valid.length) + '）。'
          + '单点超限提示局部异常，整断面同步超限更可能是阈值取值偏严或约束体系整体变位，建议先复核阈值与支座状态。';
      }).join('<br>');
      root.appendChild(nb);
    }

    var p = document.createElement('div');
    p.className = 'prose';
    p.innerHTML = '<b>为什么不再用统一系数：</b>桥梁监测的阈值本质是「各监测项自己的控制值」——'
      + '位移看设计容许变位、索力看成桥索力与容许索力、应变看设计应力，量纲和量级都不同，'
      + '用一个跨指标的倍率去套，等于把物理意义抹掉了。规范（JT/T 1037）也是分项给倍率的。'
      + '本系统因此改为直接读该测点的各级阈值，判到哪级就是哪级，并可追溯到具体阈值记录。';
    root.appendChild(p);
  }

  /* ============================================================
     A3 相关性
     ============================================================ */
  function corrVerdict(g) {
    var rs = g.rs;
    if (!rs.length) return { t: '样本不足', c: '#63839f' };
    if (g.minR <= -0.85) return { t: '疑似极性接反', c: '#ff5f6d' };
    if (g.maxR >= 0.85 && g.weak > 0) return { t: '存在单通道异常', c: '#ff9351' };
    if (g.avgAbs < 0.30) return { t: '判据不适用', c: '#63839f' };
    return { t: '相关性正常', c: '#3adc9b' };
  }

  function renderCorr(root) {
    var all = A.channels.filter(function (c) { return c.n >= 6; });
    var groups = {};
    all.forEach(function (c) {
      var k = c.locCode + '|' + c.indName;
      (groups[k] = groups[k] || []).push(c);
    });
    var list = Object.keys(groups).map(function (k) {
      var cs = groups[k];
      return { key: k, code: cs[0].locCode, ind: cs[0].indName, comp: cs[0].comp, chs: cs };
    }).filter(function (g) { return g.chs.length >= 2; });

    list.forEach(function (g) {
      g.chs = g.chs.slice(0, 12);
      var M = BA.corrMatrix(g.chs, 30 * 60 * 1000);
      var rs = [];
      for (var i = 0; i < g.chs.length; i++) for (var j = i + 1; j < g.chs.length; j++) {
        var v = M.m[i][j];
        if (v != null) rs.push(v);
      }
      g.M = M; g.rs = rs;
      g.avgAbs = rs.length ? rs.reduce(function (a, b) { return a + Math.abs(b); }, 0) / rs.length : 0;
      g.minR = rs.length ? Math.min.apply(null, rs) : 0;
      g.maxR = rs.length ? Math.max.apply(null, rs) : 0;
      g.weak = rs.filter(function (r) { return Math.abs(r) < 0.3; }).length;
      g.v = corrVerdict(g);
    });

    var order = { '疑似极性接反': 0, '存在单通道异常': 1, '判据不适用': 2, '相关性正常': 3, '样本不足': 4 };
    list.sort(function (a, b) { return (order[a.v.t] - order[b.v.t]) || (b.chs.length - a.chs.length); });

    root.innerHTML = formula([
      'r<sub>jk</sub> = Σ(x<sub>j</sub>−x̄<sub>j</sub>)(x<sub>k</sub>−x̄<sub>k</sub>) / √[Σ(x<sub>j</sub>−x̄<sub>j</sub>)² · Σ(x<sub>k</sub>−x̄<sub>k</sub>)²]',
      '<span class="cm">同断面同指标通道受同一荷载/温度场驱动，应显著正相关；r &lt; 0.3 为弱相关，r ≤ −0.85 疑似极性接反</span>',
      '<span class="cm">对齐方式：各设备报文时刻不重合，按 30 min 时间桶取均值后配对（当前数据平均提升可算对数 3 倍以上）</span>'
    ]);

    // 分组总览
    var ov = document.createElement('div');
    ov.innerHTML = '<div class="sec-title">分组筛查总览（按严重程度排序，点击行查看矩阵）</div>'
      + '<table class="dt"><thead><tr><th>构件</th><th>指标</th><th class="mono">通道</th><th class="mono">平均 |r|</th>'
      + '<th class="mono">最小 r</th><th class="mono">最大 r</th><th class="mono">弱相关对</th><th>结论</th></tr></thead><tbody>'
      + list.slice(0, 10).map(function (g, i) {
        return '<tr data-key="' + g.key + '" style="cursor:pointer"><td><b>' + esc(g.comp) + '</b></td>'
          + '<td>' + esc(g.ind) + '</td><td class="mono">' + g.chs.length + '</td>'
          + '<td class="mono">' + g.avgAbs.toFixed(2) + '</td>'
          + '<td class="mono" style="color:' + (g.minR <= -0.85 ? '#ff5f6d' : '#c4dcf2') + '">' + g.minR.toFixed(2) + '</td>'
          + '<td class="mono">' + g.maxR.toFixed(2) + '</td>'
          + '<td class="mono">' + g.weak + '/' + g.rs.length + '</td>'
          + '<td style="color:' + g.v.c + ';font-weight:700">' + g.v.t + '</td></tr>';
      }).join('') + '</tbody></table>';
    root.appendChild(ov);

    var box = document.createElement('div');
    root.appendChild(box);

    if (!ST.corrKey || !list.some(function (g) { return g.key === ST.corrKey; })) {
      ST.corrKey = list[0] ? list[0].key : null;
    }

    function draw() {
      var g = list.filter(function (x) { return x.key === ST.corrKey; })[0];
      if (!g) { box.innerHTML = '<div class="empty-tip">无可用分组</div>'; return; }
      box.innerHTML = '';

      // 每通道平均相关
      var avg = [];
      for (var i = 0; i < g.chs.length; i++) {
        var sum = 0, c = 0;
        for (var j = 0; j < g.chs.length; j++) if (i !== j && g.M.m[i][j] != null) { sum += g.M.m[i][j]; c++; }
        avg.push(c ? sum / c : 0);
      }
      var worstIdx = avg.indexOf(Math.min.apply(null, avg));

      // 强负相关对
      var negPair = null;
      for (i = 0; i < g.chs.length; i++) for (j = i + 1; j < g.chs.length; j++) {
        var v = g.M.m[i][j];
        if (v != null && v <= -0.85 && (!negPair || v < negPair.r)) negPair = { a: g.chs[i], b: g.chs[j], r: v };
      }

      box.insertAdjacentHTML('beforeend', '<div class="sec-title">相关矩阵 · ' + esc(g.comp) + ' · ' + esc(g.ind) + '（' + g.chs.length + ' 路）</div>');
      var hmBox = document.createElement('div');
      hmBox.className = 'chart-box';
      hmBox.style.overflowX = 'auto';
      hmBox.appendChild(CH.heatmap({ labels: g.chs.map(function (c) { return String(c.id).slice(-2); }), m: g.M.m, cell: g.chs.length > 9 ? 28 : 34, labW: 46 }));
      hmBox.insertAdjacentHTML('beforeend', '<div class="legend-row">'
        + '<span><i style="background:#2fb3d8;height:8px;width:10px"></i>正相关</span>'
        + '<span><i style="background:#7a3540;height:8px;width:10px"></i>负相关</span>'
        + '<span><i style="background:rgba(60,110,160,.25);height:8px;width:10px"></i>不可算（重叠不足）</span></div>');
      box.appendChild(hmBox);

      box.insertAdjacentHTML('beforeend', kvs([
        { k: '参与通道', v: g.chs.length, u: '路' },
        { k: '平均 |r|', v: g.avgAbs.toFixed(2), cls: g.avgAbs < 0.3 ? 'warn' : '' },
        { k: '弱相关对', v: g.weak + '/' + g.rs.length },
        { k: '平均相关最低', v: g.chs[worstIdx].dev.locCode + '·' + BA.shortId(g.chs[worstIdx].id), u: '' },
        { k: '该通道平均 r', v: avg[worstIdx].toFixed(2), cls: avg[worstIdx] < 0 ? 'bad' : '' }
      ]));

      if (negPair) {
        box.insertAdjacentHTML('beforeend', '<div class="note-box"><b>疑似极性/方向接反</b><br>'
          + esc(BA.shortId(negPair.a.id)) + ' ↔ ' + esc(BA.shortId(negPair.b.id)) + '：r = ' + negPair.r.toFixed(3)
          + '。同断面同向指标出现强负相关，通常由采集通道正负极接反、或传感器安装方向相反引起，'
          + '这会直接导致效应比符号判断错误。建议现场核对两路的接线极性与安装方向。</div>');
      } else if (g.v.t === '存在单通道异常') {
        box.insertAdjacentHTML('beforeend', '<div class="note-box"><b>单通道数据质量告警</b><br>'
          + '组内存在高相关通道对（最大 r = ' + g.maxR.toFixed(2) + '），但有 ' + g.weak + ' 对弱相关（|r| &lt; 0.3），'
          + '典型特征是某一路与其余通道都不相关。优先怀疑 <b>' + esc(g.chs[worstIdx].dev.locCode + ' · ' + BA.shortId(g.chs[worstIdx].id))
          + '</b>（平均 r = ' + avg[worstIdx].toFixed(2) + '）的靶标偏移、安装松动或采集通道故障。</div>');
      } else if (g.v.t === '判据不适用') {
        box.insertAdjacentHTML('beforeend', '<div class="note-box info"><b>为什么这组"相关性低"不算问题</b><br>'
          + '组内平均 |r| 仅 ' + g.avgAbs.toFixed(2) + '，但最大 r 也只有 ' + g.maxR.toFixed(2) + '，'
          + '说明不是某一两路异常，而是整组本来就不同步——该组测点分布在不同截面或不同方向，'
          + '彼此不受同一局部变形控制。此时 Pearson 判据不适用，应先按"同一截面 + 同一方向"重新分组，再做筛查。</div>');
      } else if (g.v.t === '相关性正常') {
        box.insertAdjacentHTML('beforeend', '<div class="note-box info">组内通道相关性整体良好（平均 |r| = ' + g.avgAbs.toFixed(2)
          + '），未发现孤立异常通道，该组数据可直接进入后续建模。</div>');
      }

      var p = document.createElement('div');
      p.className = 'prose';
      p.innerHTML = '<b>工程做法：</b>相关性分析是数据清洗的前置环节——先筛传感器、再做结构判断。'
        + '本桥 8# 孔断面布设多路位移计与裂缝计，正常工况下应由同一车辆荷载与温度场同步驱动。'
        + '把"某一路和谁都不相关"与"整组都不相关"区分开，是避免误判的关键。';
      box.appendChild(p);
    }
    draw();
    ov.querySelectorAll('tr[data-key]').forEach(function (tr) {
      tr.onclick = function () { ST.corrKey = tr.getAttribute('data-key'); draw(); };
    });
  }

  /* ============================================================
     A4 异常识别
     ============================================================ */
  function renderAnomaly(root) {
    var cand = A.channels.filter(function (c) { return c.n >= 8; })
      .sort(function (a, b) { return (b.eta || 0) - (a.eta || 0); });
    var valid = A.channels.filter(function (c) { return c.qc === 'ok' && c.n >= 6; });
    var hasAll = valid.length >= 3;
    if (!ST.anomId || (ST.anomId !== '__all__' && !cand.some(function (c) { return c.id === ST.anomId; }))) {
      ST.anomId = hasAll ? '__all__' : (cand[0] ? cand[0].id : null);
    }

    root.innerHTML = formula([
      '① 稳健标准化：z<sub>i</sub> = (x<sub>i</sub> − μ) / σ',
      '② 状态编码：按 VG 分位分箱，得状态码 s<sub>i</sub> ∈ {0, …, VG−1}',
      '③ 异常状态：|z<sub>i</sub>| &gt; σ<sub>th</sub>，或落入极尾箱且 |z<sub>i</sub>| 偏大',
      '④ 异常时间段：连续 N_ab 个异常状态即判定，允许间隔 G_ab 个正常状态',
      '<span class="cm">VG 越小模式越多；N_ab 越小越敏感；G_ab 控制断点容忍度 —— 对应"无监督建模 → 圈定异常时段 → 交模型归因"的分析范式</span>'
    ]);
    root.insertAdjacentHTML('beforeend', '<div class="ctrl-row">'
      + '<div class="ctrl"><label>分析对象</label><select id="anSel" style="max-width:330px">'
      + (hasAll ? '<option value="__all__"' + (ST.anomId === '__all__' ? ' selected' : '') + '>全桥综合状态指数（' + valid.length + ' 路通道标准化聚合）</option>' : '')
      + cand.slice(0, 60).map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === ST.anomId ? ' selected' : '') + '>' + esc(c.comp + ' · ' + c.indName + ' · ' + BA.shortId(c.id)) + '</option>';
      }).join('') + '</select></div>'
      + '<div class="ctrl"><label>VG</label><input type="range" id="anVG" min="3" max="12" step="1" value="6"><span class="rv" id="anVGv">6</span></div>'
      + '<div class="ctrl"><label>N_ab</label><input type="range" id="anNab" min="2" max="8" step="1" value="3"><span class="rv" id="anNabv">3</span></div>'
      + '<div class="ctrl"><label>G_ab</label><input type="range" id="anGab" min="0" max="3" step="1" value="1"><span class="rv" id="anGabv">1</span></div>'
      + '<div class="ctrl"><label>σ 阈值</label><input type="range" id="anSig" min="1.2" max="3.2" step="0.1" value="2"><span class="rv" id="anSigv">2.0</span></div>'
      + '</div>');

    var box = document.createElement('div');
    root.appendChild(box);

    function draw() {
      var isAll = ST.anomId === '__all__';
      var ch = isAll ? null : A.channels.filter(function (c) { return c.id === ST.anomId; })[0];
      var ser = isAll ? BA.compositeSeries(valid) : (ch ? BA.D.series[ch.id] : null);
      if (!ser || ser.length < 5) { box.innerHTML = '<div class="empty-tip">样本不足，无法建模</div>'; return; }

      var VG = +document.getElementById('anVG').value;
      var Nab = +document.getElementById('anNab').value;
      var Gab = +document.getElementById('anGab').value;
      var Sig = +document.getElementById('anSig').value;
      document.getElementById('anVGv').textContent = VG;
      document.getElementById('anNabv').textContent = Nab;
      document.getElementById('anGabv').textContent = Gab;
      document.getElementById('anSigv').textContent = Sig.toFixed(1);

      var res = BA.detectAnomaly(ser, { VG: VG, Nab: Nab, Gab: Gab, sigma: Sig });
      var unit = isAll ? 'σ' : (ch.unit || '');

      var abn = [];
      res.points.forEach(function (p, i) { if (res.abnormal[i]) abn.push(p); });
      var ys = res.points.map(function (p) { return p[1]; });
      var yDom = isAll
        ? [Math.min(-Sig * 1.15, Math.min.apply(null, ys)), Math.max(Sig * 1.15, Math.max.apply(null, ys))]
        : null;
      var svg = CH.lineChart({
        w: CW(), h: 230, cssH: 230, yDomain: yDom,
        series: [
          { pts: res.points, color: '#38d9f5', w: 1.8, dots: res.points.length <= 40, r: 2, area: true },
          { pts: abn, color: '#ff5f6d', dots: true, r: 3.6, w: 0 }
        ],
        xFormat: function (v) { return BA.timeStr(v).split(' ')[1]; },
        hlines: (isAll
          ? [{ y: Sig, color: '#ff9351', label: '+' + Sig.toFixed(1) + 'σ' }, { y: -Sig, color: '#ff9351', label: '−' + Sig.toFixed(1) + 'σ' }]
          : (ch && ch.limit ? [{ y: ch.limit, color: '#ff9351', label: '三级限值' }, { y: -ch.limit, color: '#ff9351', label: '' }] : [])),
        vmarks: res.segments.map(function (s) { return { x: s.t0, color: '#ffc251' }; })
      });
      box.innerHTML = '';
      box.appendChild(chartWrap(svg, [
        { c: '#38d9f5', t: isAll ? '全桥综合状态指数（各通道 z 均值）' : '实测序列' },
        { c: '#ff5f6d', t: '异常状态点' },
        { c: '#ffc251', t: '异常时间段起点' }
      ]));

      var sb = document.createElement('div');
      sb.className = 'chart-box';
      sb.innerHTML = '<div style="font-size:10.5px;color:#63839f;margin-bottom:5px">状态编码序列（柱高 = 状态码，红色 = 异常状态）</div>';
      sb.appendChild(CH.stateStrip(res.states, res.abnormal));
      box.appendChild(sb);

      box.insertAdjacentHTML('beforeend', kvs([
        { k: '样本数', v: res.vals.length, u: '点' },
        { k: '均值 μ', v: n(res.mu, isAll ? 3 : 3), u: unit },
        { k: '标准差 σ', v: n(res.sd, isAll ? 3 : 3), u: unit },
        { k: '异常状态点', v: res.abnormal.filter(Boolean).length, u: '个', cls: res.abnormal.filter(Boolean).length ? 'warn' : '' },
        { k: '异常时间段', v: res.segments.length, u: '段', cls: res.segments.length ? 'bad' : '' },
        { k: '变异系数', v: (Math.abs(res.mu) < res.sd * 0.02 ? '—' : (res.sd / Math.abs(res.mu)).toFixed(3)) }
      ]));

      if (res.segments.length) {
        box.insertAdjacentHTML('beforeend', '<div class="sec-title">识别出的异常时间段</div>'
          + '<table class="dt"><thead><tr><th>序号</th><th>起始</th><th>结束</th><th class="mono">持续点数</th><th class="mono">峰值 |z|</th></tr></thead><tbody>'
          + res.segments.map(function (sg, i) {
            return '<tr><td>' + (i + 1) + '</td><td class="mono">' + BA.timeFull(sg.t0) + '</td><td class="mono">' + BA.timeFull(sg.t1) + '</td>'
              + '<td class="mono">' + sg.count + '</td><td class="mono" style="color:#ff9351">' + sg.peakZ.toFixed(2) + '</td></tr>';
          }).join('') + '</tbody></table>');
      } else {
        box.insertAdjacentHTML('beforeend', '<div class="note-box info"><b>判定：本时段结构状态平稳</b><br>'
          + '在当前参数（VG=' + VG + '，N_ab=' + Nab + '，G_ab=' + Gab + '，σ=' + Sig.toFixed(1) + '）下，'
          + res.vals.length + ' 个时点全部落在连续异常判据之外，未识别出异常时间段。'
          + '可把 σ 降到 1.6 或 N_ab 降到 2 观察更敏感的判据——这也是实际工程中"调参看稳定性"的常规做法。</div>');
      }

      var p = document.createElement('div');
      p.className = 'prose';
      p.innerHTML = '<b>方法来源与适用性：</b>桥梁监测数据是高频时间序列，无法直接送入大语言模型。'
        + '工程上先做「无监督快速建模」——把连续量编码成离散状态，用 N_ab / G_ab 判据把零散异常点凝聚成异常时间段，'
        + '再把这些时段的数据交给模型做归因。好处是不需要标注数据，且对缓慢劣化（基线漂移）同样敏感。'
        + '注意：本期数据为小时级报文（' + res.vals.length + ' 个时点），而该方法在 20 Hz 原始序列上效果最佳；'
        + '点数越少，N_ab 应相应调小。';
      box.appendChild(p);
    }
    draw();
    document.getElementById('anSel').onchange = function () { ST.anomId = this.value; draw(); };
    ['anVG', 'anNab', 'anGab', 'anSig'].forEach(function (id) {
      document.getElementById(id).oninput = draw;
    });
  }

  /* ============================================================
     A5 索力
     ============================================================ */
  function renderCable(root) {
    var cab = A.channels.filter(function (c) { return c.indName === '索力'; });
    var codes = [];
    for (var i = 1; i <= 13; i++) codes.push('C' + (i < 10 ? '0' + i : i));
    var avail = codes.filter(function (c) { return A.comps.some(function (x) { return x.code === c; }); });

    if (!avail.length) { root.innerHTML = '<div class="empty-tip">当前数据没有可分析的索力构件</div>'; return; }
    root.innerHTML = formula([
      'T = 4 m L² f²',
      '<span class="cm">T 索力(kN)；m 索单位长度质量(kg/m)；L 计算索长(m)；f 一阶横向自振频率(Hz)</span>',
      '反算频率：f = √(T / 4mL²)'
    ]);
    root.insertAdjacentHTML('beforeend', '<div class="ctrl-row">'
      + '<div class="ctrl"><label>索号</label><select id="cbSel">'
      + avail.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="ctrl"><label>计算索长 L</label><input type="number" id="cbL" step="0.1" value="0"> <span style="color:#63839f">m</span></div>'
      + '<div class="ctrl"><label>线密度 m</label><input type="number" id="cbM" step="0.5" value="18.5"> <span style="color:#63839f">kg/m</span></div>'
      + '<div class="ctrl"><label>实测频率 f</label><input type="number" id="cbF" step="0.01" value="3.80"> <span style="color:#63839f">Hz</span></div>'
      + '</div>');

    var res = document.createElement('div');
    root.appendChild(res);
    var tbl = document.createElement('div');
    root.appendChild(tbl);

    function draw() {
      var code = document.getElementById('cbSel').value;
      var idx = parseInt(code.slice(1), 10);
      var g = BA.cableGeom(idx, 13);
      var Lel = document.getElementById('cbL');
      if (!Lel.value || +Lel.value === 0) Lel.value = g.L.toFixed(1);
      var L = +Lel.value, m = +document.getElementById('cbM').value, f = +document.getElementById('cbF').value;
      var T = BA.cableForce(m, L, f);

      // 该索的阈值
      var cp = A.comps.filter(function (c) { return c.code === code; })[0];
      var ch = cp ? cp.channels.filter(function (c) { return c.indName === '索力' && c.thr; })[0] : null;
      var rgOwn = BA.indThresholdRange('QL1701', true);
      var rgAll = rgOwn || BA.indThresholdRange('QL1701', false);
      var lo = ch && ch.thr ? ch.thr.lo : (rgAll && rgAll.lo ? rgAll.lo[0] : null);
      var hi = ch && ch.thr ? ch.thr.hi : (rgAll && rgAll.hi ? rgAll.hi[1] : null);
      var thrFrom = (ch && ch.thr) ? '本桥阈值表' : (rgOwn ? '本桥同指标' : (rgAll ? '跨桥模板值' : '未配置'));
      var own = !!(ch && ch.thr);
      var status = '—', color = '#63839f';
      if (hi != null && T > hi) { status = (own ? '' : '超出模板') + '上限'; color = '#ff5f6d'; }
      else if (lo != null && T < lo) { status = '低于下限（索力松弛）'; color = '#ffc251'; }
      else if (hi != null) { status = own ? '区间内' : '跨桥模板区间内'; color = '#3adc9b'; }

      res.innerHTML = kvs([
        { k: '索力 T', v: T.toFixed(1), u: 'kN', cls: 'accent' },
        { k: '计算索长 L', v: L.toFixed(1), u: 'm' },
        { k: '线密度 m', v: m.toFixed(1), u: 'kg/m' },
        { k: '自振频率 f', v: f.toFixed(2), u: 'Hz' },
        { k: '阈值区间', v: (lo == null ? '—' : lo.toFixed(0)) + ' ~ ' + (hi == null ? '—' : hi.toFixed(0)), u: 'kN' },
        { k: '判定', v: '<span style="color:' + color + '">' + status + '</span>' },
        { k: '阈值来源', v: thrFrom, u: '' }
      ]);

      // 频率-索力曲线
      var pts = [];
      for (var x = 0.2; x <= 6.001; x += 0.05) pts.push([x, BA.cableForce(m, L, x)]);
      var svg = CH.lineChart({
        w: CW(), h: 200, cssH: 200,
        series: [
          { pts: pts, color: '#38d9f5', w: 2, area: true, dots: false },
          { pts: [[f, T]], color: '#ffc251', dots: true, r: 4, w: 0 }
        ],
        xDomain: [0.2, 6], xFormat: function (v) { return v.toFixed(1); },
        hlines: [
          hi != null ? { y: hi, color: '#ff5f6d', label: '上限 ' + hi.toFixed(0) + ' kN' } : null,
          lo != null ? { y: lo, color: '#ff9351', label: '下限 ' + lo.toFixed(0) + ' kN' } : null
        ].filter(Boolean)
      });
      var box = res.nextElementSibling;
      if (box && box.classList.contains('chart-box')) box.remove();
      res.insertAdjacentElement('afterend', chartWrap(svg, [{ c: '#38d9f5', t: 'T–f 关系曲线' }, { c: '#ffc251', t: '当前取值' }]));

      // 实测通道表
      var rg = BA.indThresholdRange('QL1701', true) || BA.indThresholdRange('QL1701', false) || { lo: null, hi: null };
      var thrScope = rg.own ? '本桥' : '跨桥模板';
      function tl(v, side) {
        if (v != null) return n(v, 1);
        if (side === 'lo' && rg.lo) return '<span style="color:#63839f">' + n(rg.lo[0], 0) + '~' + n(rg.lo[1], 0) + '*</span>';
        if (side === 'hi' && rg.hi) return '<span style="color:#63839f">' + n(rg.hi[0], 0) + '~' + n(rg.hi[1], 0) + '*</span>';
        return '—';
      }
      tbl.innerHTML = '<div class="sec-title" style="margin-top:14px">当期索力通道实测状态</div>'
        + '<table class="dt"><thead><tr><th>构件</th><th>测点</th><th class="mono">条数</th><th class="mono">实测峰值</th><th class="mono">阈值下限</th><th class="mono">阈值上限</th><th>数据状态</th></tr></thead><tbody>'
        + cab.map(function (c) {
          return '<tr><td>' + esc(c.comp) + '</td><td class="mono" style="font-size:10px">' + esc(BA.shortId(c.id)) + '</td>'
            + '<td class="mono">' + c.n + '</td><td class="mono">' + n(c.peak, 4) + '</td>'
            + '<td class="mono">' + tl(c.thr ? c.thr.lo : null, 'lo') + '</td>'
            + '<td class="mono">' + tl(c.thr ? c.thr.hi : null, 'hi') + '</td>'
            + '<td style="color:' + (c.qc === 'scale' ? '#ff5f6d' : '#3adc9b') + '">' + (c.qc === 'scale' ? '量纲异常·待标定' : '正常') + '</td></tr>';
        }).join('') + '</tbody></table>'
        + '<div style="font-size:10.5px;color:#63839f;margin:-6px 0 10px">* 该测点在本桥阈值表中无记录，显示为同指标（QL1701）' + thrScope + '阈值范围（共 ' + rg.n + ' 台设备参与统计）</div>';

      var p = document.createElement('div');
      p.className = 'prose';
      p.innerHTML = '<b>关键发现：</b>本桥阈值表未收录索力指标（' + cab.length + ' 路索力测点均无阈值记录），'
        + '表中阈值列为同指标跨桥模板值，仅供量级参考。全部 ' + cab.length + ' 路通道实测值均在 0.0–0.04 量级，'
        + '而阈值下限为 1,125–1,196 kN、上限 1,185–1,800 kN。真实索力不可能为 0.04 kN，'
        + '说明采集端输出的可能是加速度或频率原始值，尚未按索的参数换算为索力。'
        + '这也是「数据质量门禁」把索力通道整体排除在健康度评分之外的原因——'
        + '不是桥有问题，是数据没接对。建议按上式在采集端或平台侧增加换算环节。';
      tbl.appendChild(p);
    }
    draw();
    document.getElementById('cbSel').onchange = function () {
      var idx = parseInt(this.value.slice(1), 10);
      document.getElementById('cbL').value = BA.cableGeom(idx, 13).L.toFixed(1);
      draw();
    };
    ['cbL', 'cbM', 'cbF'].forEach(function (id) { document.getElementById(id).oninput = draw; });
  }

  /* ============================================================
     A6 温度效应
     ============================================================ */
  function renderTemp(root) {
    var pairs = [];
    A.comps.forEach(function (cp) {
      var th = cp.channels.filter(function (c) { return c.indName === '温度' && c.n >= 6; });
      var ef = cp.channels.filter(function (c) { return (c.indName === '位移' || c.indName === '裂缝' || c.indName === '应变') && c.n >= 6; });
      if (th.length && ef.length) pairs.push({ cp: cp, th: th[0], ef: ef });
    });

    root.innerHTML = formula([
      'y = a·T + b &nbsp;<span class="cm">T 温度，y 结构响应（位移/裂缝/应变）</span>',
      'a = Σ(T−T̄)(y−ȳ) / Σ(T−T̄)² &nbsp;<span class="cm">温度敏感系数</span>',
      'ŷ<sub>残差</sub> = y − (aT + b) &nbsp;<span class="cm">扣除温度分量后的荷载/劣化响应</span>',
      'R² = [Σ(T−T̄)(y−ȳ)]² / [Σ(T−T̄)²·Σ(y−ȳ)²]'
    ]);

    if (!pairs.length) {
      root.insertAdjacentHTML('beforeend', '<div class="empty-tip">当期无同构件温度—效应同步通道</div>');
      return;
    }
    if (!ST.tempComp || !pairs.some(function (p) { return p.cp.code === ST.tempComp; })) ST.tempComp = pairs[0].cp.code;

    root.insertAdjacentHTML('beforeend', '<div class="ctrl-row">'
      + '<div class="ctrl"><label>构件</label><select id="tmSel">'
      + pairs.map(function (p) { return '<option value="' + p.cp.code + '"' + (p.cp.code === ST.tempComp ? ' selected' : '') + '>' + esc(p.cp.name) + '</option>'; }).join('')
      + '</select></div>'
      + '<div class="ctrl"><label>响应通道</label><select id="tmCh"></select></div></div>');

    var box = document.createElement('div');
    root.appendChild(box);
    var chSel = document.getElementById('tmCh');

    function pair() { return pairs.filter(function (p) { return p.cp.code === ST.tempComp; })[0] || pairs[0]; }
    function fillCh() {
      var p = pair();
      chSel.innerHTML = p.ef.map(function (c) { return '<option value="' + c.id + '">' + c.indName + ' · ' + BA.shortId(c.id) + '</option>'; }).join('');
    }
    function draw() {
      var p = pair();
      var e = p.ef.filter(function (c) { return c.id === chSel.value; })[0] || p.ef[0];
      var al = BA.align(BA.D.series[p.th.id], BA.D.series[e.id]);
      if (al.x.length < 5) { box.innerHTML = '<div class="empty-tip">温度与响应同刻报文不足</div>'; return; }
      var r = BA.linreg(al.x, al.y);
      if (!r) { box.innerHTML = '<div class="empty-tip">温度序列无变化，无法回归</div>'; return; }
      var resid = al.y.map(function (y, i) { return y - (r.a * al.x[i] + r.b); });

      box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', kvs([
        { k: '相关系数 r', v: r.r.toFixed(3), cls: Math.abs(r.r) > 0.6 ? 'accent' : '' },
        { k: '决定系数 R²', v: r.r2.toFixed(3) },
        { k: '温度敏感系数 a', v: r.a.toExponential(2), u: e.unit + '/℃' },
        { k: '截距 b', v: r.b.toFixed(3), u: e.unit },
        { k: '样本对', v: al.x.length, u: '对' },
        { k: '响应幅度', v: (Math.max.apply(null, resid) - Math.min.apply(null, resid)).toFixed(3), u: e.unit + '（残差）' }
      ]));

      // 回归散点
      var svg = CH.lineChart({
        w: CW(), h: 210, cssH: 210,
        series: [
          { pts: al.x.map(function (x, i) { return [x, al.y[i]]; }), color: '#38d9f5', dots: true, r: 2.6, w: 0 },
          { pts: [[Math.min.apply(null, al.x), r.a * Math.min.apply(null, al.x) + r.b], [Math.max.apply(null, al.x), r.a * Math.max.apply(null, al.x) + r.b]], color: '#ffc251', w: 2, dots: false }
        ],
        xFormat: function (v) { return v.toFixed(1); }
      });
      box.appendChild(chartWrap(svg, [{ c: '#38d9f5', t: '实测点（T, ' + e.indName + '）' }, { c: '#ffc251', t: '回归直线 y = aT + b' }]));

      // 补偿前后
      var svg2 = CH.lineChart({
        w: CW(), h: 190, cssH: 190,
        series: [
          { pts: al.y.map(function (y, i) { return [i, y]; }), color: '#38d9f5', w: 1.6, dots: false },
          { pts: resid.map(function (y, i) { return [i, y]; }), color: '#3adc9b', w: 1.6, dots: false }
        ],
        xFormat: function (v) { return '#' + Math.round(v); }
      });
      box.appendChild(chartWrap(svg2, [{ c: '#38d9f5', t: '原始响应' }, { c: '#3adc9b', t: '扣除温度后残差' }]));

      box.insertAdjacentHTML('beforeend', '<div class="note-box info"><b>解读：</b>'
        + 'R² = ' + r.r2.toFixed(2) + ' 表示 ' + e.indName + '的变异中有 ' + pct(r.r2) + ' 可由温度线性解释，'
        + (r.r2 > 0.5 ? '说明当前响应<strong>主要由温度效应主导</strong>，直接拿原始值做安全评估会误判。'
          : '温度解释力有限，' + e.indName + '的变异更多来自车辆荷载或结构本身，需要结合交通流数据判读。')
        + '实际评估应使用绿色残差序列：残差稳定说明结构状态稳定，残差出现趋势性抬升才是劣化信号。</div>');

      var pp = document.createElement('div');
      pp.className = 'prose';
      pp.innerHTML = '<b>为什么必须先分离温度：</b>悬索桥主梁纵向变位中，温度分量常占总量的 60% 以上。'
        + '若不扣除，夏季正午的位移峰值会被误判为超载或约束异常。本模块把温度作为协变量扣除，'
        + '得到的残差才是可以用于报警与劣化判断的量。';
      box.appendChild(pp);
    }
    fillCh();
    draw();
    document.getElementById('tmSel').onchange = function () { ST.tempComp = this.value; fillCh(); draw(); };
    chSel.onchange = draw;
  }

  /* ============================================================
     A7 趋势
     ============================================================ */
  function renderTrend(root) {
    // 默认优先给"有有效效应比"的通道，避免一进来就是恒定/待标定通道
    var cand = A.channels.filter(function (c) { return c.n >= 8 && c.qc === 'ok' && c.eta != null; })
      .sort(function (a, b) { return (b.eta || 0) - (a.eta || 0); });
    if (!cand.length) {
      cand = A.channels.filter(function (c) { return c.n >= 8; }).sort(function (a, b) { return (b.eta || 0) - (a.eta || 0); });
    }
    if (!ST.trendId || !cand.some(function (c) { return c.id === ST.trendId; })) ST.trendId = cand[0] ? cand[0].id : null;

    root.innerHTML = formula([
      'Δμ = mean(x<sub>后段</sub>) − mean(x<sub>前段</sub>) &nbsp;<span class="cm">基线漂移量</span>',
      'v = Δμ / Δt &nbsp;<span class="cm">漂移速率（单位/小时）</span>',
      '增量建模：以第 k 段数据建模后，将第 k+1 段作为增量集继续训练，形成跨时段生命周期曲线'
    ]);
    root.insertAdjacentHTML('beforeend', '<div class="ctrl-row"><div class="ctrl"><label>通道</label><select id="trSel">'
      + cand.slice(0, 60).map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === ST.trendId ? ' selected' : '') + '>' + esc(c.comp + ' · ' + c.indName + ' · ' + BA.shortId(c.id)) + '</option>';
      }).join('') + '</select></div></div>');

    var box = document.createElement('div');
    root.appendChild(box);

    function draw() {
      var ch = A.channels.filter(function (c) { return c.id === ST.trendId; })[0];
      if (!ch) return;
      var ser = BA.D.series[ch.id];
      var tr = BA.trend(ser, 0.5);
      if (!tr) { box.innerHTML = '<div class="empty-tip">样本不足</div>'; return; }

      box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', kvs([
        { k: '前段均值', v: n(tr.mA, 3), u: ch.unit },
        { k: '后段均值', v: n(tr.mB, 3), u: ch.unit },
        { k: '基线漂移 Δμ', v: (tr.delta >= 0 ? '+' : '') + n(tr.delta, 3), u: ch.unit, cls: Math.abs(tr.delta) > 0 ? 'warn' : '' },
        { k: '漂移速率', v: tr.slope.toExponential(2), u: ch.unit + '/h' },
        { k: '覆盖时长', v: tr.dur.toFixed(1), u: 'h' },
        { k: '样本数', v: ser.length, u: '点' }
      ]));

      var svg = CH.lineChart({
        w: CW(), h: 210, cssH: 210,
        series: [
          { pts: ser, color: '#38d9f5', w: 1.8, dots: true, r: 2.2, area: true },
          { pts: [[ser[0][0], tr.mA], [tr.cutAt, tr.mA]], color: '#ffc251', w: 1.4, dots: false },
          { pts: [[tr.cutAt, tr.mB], [ser[ser.length - 1][0], tr.mB]], color: '#3adc9b', w: 1.4, dots: false }
        ],
        xFormat: function (v) { return BA.timeStr(v).split(' ')[1]; },
        vmarks: [{ x: tr.cutAt, color: '#ffc251', label: '增量建模分界' }]
      });
      box.appendChild(chartWrap(svg, [{ c: '#38d9f5', t: '实测序列' }, { c: '#ffc251', t: '前段基线' }, { c: '#3adc9b', t: '后段基线' }]));

      var p = document.createElement('div');
      p.className = 'prose';
      p.innerHTML = '<b>用法：</b>桥梁健康评估最怕「单次快照」。本模块把当期数据按时间一分为二，'
        + '比较前后段基线是否漂移。' + (Math.abs(tr.delta) > Math.abs(tr.mA) * 0.2
          ? '当前 Δμ 已达到前段均值的 ' + pct(Math.abs(tr.delta) / Math.abs(tr.mA || 1)) + '，属于显著漂移，建议核查是否存在传感器零点漂移或结构状态改变。'
          : '当前漂移量为前段均值的 ' + pct(Math.abs(tr.delta) / Math.abs(tr.mA || 1)) + '，处于平稳范围。')
        + '实际工程中应按周/月为增量单元持续拼接，最终形成整条生命周期曲线（这正是监测系统相对定期检查的核心价值）。';
      box.appendChild(p);
    }
    draw();
    document.getElementById('trSel').onchange = function () { ST.trendId = this.value; draw(); };
  }

  /* ============================================================
     V1 振动分析（振动数据通道专项）
     ============================================================ */
  var VIB_COLORS = ['#38d9f5', '#ff9f4a', '#5fd08a', '#ff8faa', '#9b8bf4', '#ffd479',
    '#7fc4e8', '#e377c2', '#bcbd22', '#17becf'];

  /* 18 路同框时按色相均匀取色，避免 10 色循环造成重色 */
  function vibColor(i, n) {
    var total = Math.max(n || 18, 8);
    var h = Math.round((i * 360 / total + 195) % 360);
    var l = i % 2 ? 58 : 70;
    return 'hsl(' + h + ',72%,' + l + '%)';
  }

  function shortCode(code) {
    var p = String(code).split('-');
    return p.length >= 5 ? (p[2] + '-' + p[4]) : code;
  }
  function secOf(code) {
    var p = String(code).split('-');
    for (var i = 0; i < p.length; i++) if (/^G\d{2}$/.test(p[i])) return p[i];
    return '';
  }
  function avg(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / (a.length || 1); }
  function stdv(a) {
    if (a.length < 2) return 0;
    var m = avg(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return Math.sqrt(s / (a.length - 1));
  }
  function hhmmss(t) {
    var d = new Date(t);
    function z(v) { return v < 10 ? '0' + v : v; }
    return z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
  }
  function hhmm(t) {
    var d = new Date(t);
    function z(v) { return v < 10 ? '0' + v : v; }
    return z(d.getHours()) + ':' + z(d.getMinutes());
  }

  /* 收集振动通道：优先用 MQTT 采集快照数据（含 RMS），否则退回数据集里的振动通道 */
  function vibRows() {
    var L = (global.BRIDGE_LIVE && global.BRIDGE_LIVE.channels) ? global.BRIDGE_LIVE : null;
    var rows = [], meta = null;
    if (L) {
      meta = {
        source: L.source || '', metric: L.metricName || '峰值加速度',
        updatedAt: L.updatedAt, nCh: L.nChannels || 0, nPk: L.nPackets || 0,
        fs: L.fs || 0, rawChannel: (L.rawChannels || [])[0] || '',
        live: true
      };
      Object.keys(L.channels).forEach(function (code) {
        var c = L.channels[code];
        var s = (c.series || []).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
        if (s.length < 2) return;
        var v = s.map(function (p) { return p[1]; });
        var mx = Math.max.apply(null, v), mn = Math.min.apply(null, v), mu = avg(v), sd = stdv(v);
        rows.push({
          code: code, label: shortCode(code), sec: secOf(code), unit: c.unit || 'g',
          n: s.length, series: s, peak: mx, min: mn, mean: mu, sd: sd,
          cv: mu > 0 ? sd / mu : 0, rmsMax: c.rmsMax || 0, ncol: c.ncol || 0,
          raw: (c.raw && c.raw.length) ? c.raw : null,
          rawSeg: c.rawSeg || null,
          t0: s[0][0], t1: s[s.length - 1][0]
        });
      });
    } else {
      var cs = (BA.D.devices || []).filter(function (d) { return /振动|加速度/.test(d.indName || ''); });
      meta = { live: false, source: '数据集', metric: '峰值', nCh: cs.length, nPk: 0 };
      cs.forEach(function (d) { /* 无原始时程时只列通道 */ });
    }
    rows.sort(function (a, b) { return b.peak - a.peak; });
    return { meta: meta, rows: rows };
  }

  /* 同断面倍数：同一 G 断面里 -01 与 -02 的倍数 */
  function mateFactor(rows) {
    var by = {};
    rows.forEach(function (r) { (by[r.sec] = by[r.sec] || []).push(r); });
    rows.forEach(function (r) {
      var g = by[r.sec] || [];
      var other = g.filter(function (x) { return x.code !== r.code; })[0];
      r.mate = other ? (Math.max(r.mean, other.mean) / Math.max(1e-12, Math.min(r.mean, other.mean))) : null;
      r.mateCode = other ? other.label : '';
    });
    var all = rows.map(function (r) { return r.mean; });
    var base = avg(all);
    rows.forEach(function (r) { r.ratio = base > 0 ? r.mean / base : 0; });
    return rows;
  }

  function vibVerdict(r) {
    if (r.ratio < 0.1 && r.mate && r.mate > 10) return '接近零响应，疑掉线/松动';
    if (r.mate && r.mate > 8) {
      if (r.ratio > 1.5) return '高于同断面另一路 ' + r.mate.toFixed(0) + ' 倍，重点复核';
      if (r.ratio < 0.2) return '远低于同断面另一路 ' + r.mate.toFixed(0) + ' 倍，疑标定异常';
      return '正常（同断面另一路偏大）';
    }
    if (r.ratio > 3) return '显著偏大（' + r.ratio.toFixed(1) + ' 倍），重点复核';
    if (r.ratio > 1.5) return '偏大，关注';
    return '正常';
  }

  /* ---------- 图形工具：保峰降采样 / 采集空档压缩 / FFT ---------- */
  function peakDown(pts, maxN) {
    if (pts.length <= maxN) return pts;
    var bucket = Math.ceil(pts.length / maxN), out = [];
    for (var i = 0; i < pts.length; i += bucket) {
      var best = null, gap = false;
      for (var j = i; j < Math.min(i + bucket, pts.length); j++) {
        var p = pts[j];
        if (p[1] == null || !isFinite(p[1])) { gap = true; continue; }
        if (!best || p[1] > best[1]) best = p;
      }
      if (gap) out.push([pts[i][0], null]);          // 保留断点，避免跨空档连线
      if (best) out.push(best);
    }
    return out;
  }

  /* 取「最长连续采集段」：把中间的空档和两头零散碎片全部排除，
     横轴从该段起点算起，x 为段内秒数 */
  function makeMain(rows, gapSec) {
    var GAP = (gapSec || 30) * 1000;
    var ts = [], i, j;
    rows.forEach(function (r) { for (j = 0; j < r.series.length; j++) ts.push(r.series[j][0]); });
    ts.sort(function (a, b) { return a - b; });
    if (!ts.length) return null;

    var segs = [], st = ts[0], prev = ts[0];
    for (i = 1; i < ts.length; i++) {
      if (ts[i] - prev > GAP) { segs.push({ s: st, e: prev }); st = ts[i]; }
      prev = ts[i];
    }
    segs.push({ s: st, e: prev });

    var best = segs[0];
    for (i = 1; i < segs.length; i++) if (segs[i].e - segs[i].s > best.e - best.s) best = segs[i];

    var outside = 0;
    for (i = 0; i < ts.length; i++) if (ts[i] < best.s - GAP || ts[i] > best.e + GAP) outside++;

    function X(t) { return (t - best.s) / 1000; }
    return {
      start: best.s, end: best.e, segs: segs, nSegs: segs.length,
      outside: outside, span: (best.e - best.s) / 1000,
      x: X,
      /* 只保留主段内的点；段内仍有小空档时插入 null 断点 */
      pts: function (series, maxN) {
        var out = [], last = null;
        for (var k = 0; k < series.length; k++) {
          var t = series[k][0];
          if (t < best.s || t > best.e) continue;
          if (last != null && t - last > GAP) out.push([X(last), null]);
          out.push([X(t), series[k][1]]);
          last = t;
        }
        return maxN ? peakDown(out, maxN) : out;
      }
    };
  }

  /* 迭代法 radix-2 FFT，返回单边幅值谱（长度 N/2） */
  function fftMag(sig) {
    var n = sig.length, N = 1, i, j, t;
    while (N < n) N <<= 1;
    var re = new Float64Array(N), im = new Float64Array(N);
    for (i = 0; i < n; i++) re[i] = sig[i];
    /* 位反转重排 */
    j = 0;
    for (i = 1; i < N; i++) {
      var b = N >> 1;
      for (; j & b; b >>= 1) j ^= b;
      j ^= b;
      if (i < j) {
        t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    /* 蝶形运算 */
    for (var len = 2; len <= N; len <<= 1) {
      var ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (var s = 0; s < N; s += len) {
        var cr = 1, ci = 0;
        for (var k = 0; k < len / 2; k++) {
          var a = s + k, c = a + len / 2;
          var vr = re[c] * cr - im[c] * ci, vi = re[c] * ci + im[c] * cr;
          re[c] = re[a] - vr; im[c] = im[a] - vi;
          re[a] += vr; im[a] += vi;
          var nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc;
        }
      }
    }
    var mag = new Float64Array(N / 2);
    for (i = 0; i < N / 2; i++) mag[i] = 2 * Math.sqrt(re[i] * re[i] + im[i] * im[i]) / N;
    return mag;
  }

  function vibFig(id, cap, note) {
    return '<div class="vib-fig"><div class="vib-cap">' + cap
      + (note ? ' <span>' + note + '</span>' : '') + '</div>'
      + '<div class="vib-svg" id="' + id + '"></div></div>';
  }

  function renderVib(root) {
    var V = vibRows();
    var rows = V.rows;

    if (!rows.length) {
      root.innerHTML = '<div class="sec-title">振动分析</div>'
        + '<div class="empty">当前数据集里没有可用的振动时程数据。<br>'
        + '振动分析需要按「原始包 → 峰值/有效值」聚合后的时程（如 MQTT 采集的 &lt;测点&gt;/*.csv）。<br>'
        + '导入含振动加速度通道的数据集后，本页会自动出现曲线。</div>';
      return;
    }

    mateFactor(rows);
    var AX = makeMain(rows, 30);          // 只取最长连续采集段
    function hDur(sec) {
      if (sec >= 3600) return (sec / 3600).toFixed(1) + ' h';
      if (sec >= 60) return Math.round(sec / 60) + ' min';
      return Math.round(sec) + ' s';
    }
    var totalPk = rows.reduce(function (s, r) { return s + r.n; }, 0);
    var t0 = Math.min.apply(null, rows.map(function (r) { return r.t0; }));
    var t1 = Math.max.apply(null, rows.map(function (r) { return r.t1; }));
    var spanMin = (t1 - t0) / 60000;
    var top = rows[0];
    var rel = function (t) { return (t - t0) / 1000; };
    var fs = V.meta.fs || 0;
    var rawCh = V.meta.rawChannel ? rows.filter(function (r) { return r.code === V.meta.rawChannel; })[0] : null;

    /* ---------- 概览 + 结论 ---------- */
    var bad = rows.filter(function (r) { return vibVerdict(r) !== '正常'; });
    var cvBig = rows.filter(function (r) { return r.cv > 1; });
    var baseMean = avg(rows.map(function (r) { return r.mean; }));
    var html = '<div class="sec-title">振动通道概览</div>'
      + kvs([
        { k: '通道数', v: rows.length, u: '路' },
        { k: '数据包', v: totalPk.toLocaleString(), u: '个 × ' + (top.ncol || 20) + ' 点' },
        { k: '连续采集段', v: hhmm(AX.start) + '—' + hhmm(AX.end), u: (AX.span / 60).toFixed(1) + 'min' },
        { k: '采样率', v: fs ? fs.toFixed(0) : '—', u: 'Hz' },
        { k: '峰值最大', v: n(top.peak, 4), u: top.unit + ' · ' + top.label },
        { k: '数据来源', v: V.meta.live ? 'MQTT 采集快照' : '数据集', u: V.meta.metric }
      ])
      + '<div class="vib-conc">'
      + '<div><b>结论</b>　' + (bad.length
        ? '有 <b>' + bad.length + '</b> 路需要核查，最突出的是 ' + top.label + '（' + n(top.peak, 4) + top.unit + '）。'
        : '各通道幅值处于同一量级，未见明显异常通道。') + '</div>'
      + '<div class="dim">· 峰值均值基线 ' + n(baseMean, 5) + ' g，超 3 倍基线 '
      + rows.filter(function (r) { return r.ratio > 3; }).length + ' 路，低于 0.1 倍基线 '
      + rows.filter(function (r) { return r.ratio < 0.1; }).length + ' 路。</div>'
      + (cvBig.length ? '<div class="dim">· ' + cvBig.map(function (r) { return r.label; }).join('、')
        + ' 包间 CV &gt; 1，呈冲击型（重车过桥 / 撞击），不是平稳环境振动。</div>' : '')
      + '</div>';

    /* ---------- 00 对数总览 ---------- */
    html += vibFig('vib00', '00 · 18 路同框对比（峰值加速度，对数纵轴）',
      '仅显示最长连续采集段 ' + hhmm(AX.start) + '—' + hhmm(AX.end)
      + '（' + (AX.span / 60).toFixed(1) + ' min）；另 ' + (AX.nSegs - 1) + ' 段零散数据（共 '
      + AX.outside.toLocaleString() + ' 个点）未显示');

    /* ---------- 01 逐通道小图 ---------- */
    html += '<div class="vib-fig"><div class="vib-cap">01 · 各通道 PGA 时程'
      + ' <span>每图一个通道；横轴同左，均为主段 ' + (AX.span / 60).toFixed(0) + ' min</span></div>'
      + '<div class="vib-grid">'
      + rows.map(function (r, i) {
        return '<div class="vib-cell"><div class="vib-nm">' + r.label
          + ' <span>' + r.n + ' 包 × ' + (r.ncol || 20) + ' 点</span></div>'
          + '<div class="vib-mini" data-i="' + i + '"></div>'
          + '<div class="vib-sub">峰值 ' + n(r.peak, 4) + ' · 均值 ' + n(r.mean, 5) + ' ' + r.unit + '</div></div>';
      }).join('')
      + '</div></div>';

    /* ---------- 02 四连统计 ---------- */
    html += '<div class="vib-fig"><div class="vib-cap">02 · 幅值统计对比'
      + ' <span>峰值/均值 · RMS 烈度 · 变异系数 · 包数</span></div>'
      + '<div class="vib-grid2">'
      + '<div class="vib-cell"><div class="vib-nm">① 峰值 max(PGA)</div><div id="vibPk"></div></div>'
      + '<div class="vib-cell"><div class="vib-nm">② RMS 有效值（振动烈度）</div><div id="vibRms"></div></div>'
      + '<div class="vib-cell"><div class="vib-nm">③ 包间变异系数 CV</div><div id="vibCv"></div></div>'
      + '<div class="vib-cell"><div class="vib-nm">④ 数据包数（完整性）</div><div id="vibNpk"></div></div>'
      + '</div></div>';

    /* ---------- 03 沿桥纵向 ---------- */
    html += vibFig('vib03', '03 · 沿桥纵向分布（G02 → G16）', '对数纵轴；散点为两路上游/下游，粗线为断面均值');

    /* ---------- 04 波形与频谱 ---------- */
    html += '<div class="vib-fig"><div class="vib-cap">04 · 峰值通道波形与频谱'
      + ' <span>' + (rawCh
        ? rawCh.label + ' · 连续波形 / 每包峰值序列 / 幅值谱'
          + (rawCh.rawSeg ? '' : '（原始波形为旧数据，可能跨段拼接，插上数据盘重新导入了更准）')
        : '未保留原始波形，运行 import_vib.py --raw-top 1 后可用') + '</span></div>'
      + (rawCh
        ? '<div id="vibWave"></div><div class="vib-grid2">'
          + '<div class="vib-cell"><div class="vib-nm">② 每包峰值序列</div><div id="vibSeq"></div></div>'
          + '<div class="vib-cell"><div class="vib-nm">③ 幅值谱（Nyquist ' + (fs / 2).toFixed(1) + ' Hz）</div><div id="vibSpec"></div></div>'
          + '</div>'
        : '<div class="vib-note">原始波形未导入。执行 <code>python tools/import_vib.py --raw-top 1</code> 重新生成数据后即可显示波形与频谱。</div>')
      + '</div>';

    /* ---------- 05 同断面一致性 ---------- */
    html += vibFig('vib05', '05 · 同断面双通道一致性（-01 vs -02）', '倍数 ≥ 4 直接标红');

    /* ---------- 统计表 ---------- */
    html += '<div class="sec-title">逐通道统计与初判</div>'
      + '<table class="dt vib-tb"><thead><tr>'
      + '<th>通道</th><th class="mono">包数</th><th class="mono">峰值</th><th class="mono">均值</th>'
      + '<th class="mono">RMS 最大</th><th class="mono">CV</th><th class="mono">相对基线</th>'
      + '<th class="mono">同断面倍数</th><th>初判</th></tr></thead><tbody>'
      + rows.map(function (r) {
        var vd = vibVerdict(r);
        var cls = vd === '正常' ? '' : (/远低于|接近零/.test(vd) ? 'warn' : 'bad');
        return '<tr><td>' + r.label + ' <span class="dim">' + r.code + '</span></td>'
          + '<td class="mono">' + r.n + '</td>'
          + '<td class="mono">' + n(r.peak, 4) + '</td>'
          + '<td class="mono">' + n(r.mean, 5) + '</td>'
          + '<td class="mono">' + (r.rmsMax ? n(r.rmsMax, 5) : '—') + '</td>'
          + '<td class="mono">' + r.cv.toFixed(2) + '</td>'
          + '<td class="mono">' + r.ratio.toFixed(2) + '×</td>'
          + '<td class="mono">' + (r.mate ? r.mate.toFixed(1) + '×' : '—') + '</td>'
          + '<td class="' + cls + '">' + esc(vd) + '</td></tr>';
      }).join('')
      + '</tbody></table>'
      + '<div class="vib-note">口径：每包波形取峰值 PGA = max|v|、有效值 RMS = √mean(v²)；'
      + 'CV 为包间变异系数（σ/μ），&gt;1 表示冲击型、非平稳；同断面倍数为同一 G 断面两路通道均值的比值，正常应在 1~3 倍以内。'
      + (fs ? '采样率由「包间隔中位数 × 每包点数」推断为 ' + fs.toFixed(0) + ' Hz，Nyquist ' + (fs / 2).toFixed(0)
        + ' Hz，只能反映低频振动。' : '')
      + '振动通道目前只参与趋势、对比与数据质量判读，不参与报警与结构评分。</div>';

    root.innerHTML = html;

    var W = CW();

    /* 00 对数总览：18 路叠绘 */
    var box00 = root.querySelector('#vib00');
    if (box00) {
      var s00 = rows.map(function (r, i) {
        return {
          pts: AX.pts(r.series, 260),
          color: vibColor(i, rows.length), w: 1.1, dots: false
        };
      });
      box00.appendChild(CH.lineChart({
        w: W, h: 240, cssH: 240, series: s00, yLog: true, yTicks: 5,
        xFormat: function (v) { return '+' + Math.round(v) + 's'; }, xLabels: 4
      }));
      var lg = document.createElement('div');
      lg.className = 'legend-row';
      lg.innerHTML = rows.map(function (r, i) {
        return '<span><i style="background:' + vibColor(i, rows.length) + '"></i>' + r.label + '</span>';
      }).join('');
      box00.parentNode.appendChild(lg);
    }

    /* 01 十八个小图 */
    var cells = root.querySelectorAll('.vib-mini');
    var mw = Math.max(150, Math.floor((W - 24) / 3) - 12);
    cells.forEach(function (c) {
      var r = rows[Number(c.getAttribute('data-i'))];
      c.appendChild(CH.lineChart({
        w: mw, h: 86, cssH: 86,
        pad: { l: 34, r: 8, t: 8, b: 16 }, yTicks: 2, xLabels: 2,
        series: [{
          pts: AX.pts(r.series, 160),
          color: '#38d9f5', w: 1.1, dots: false, area: true
        }],
        xFormat: function (v) { return Math.round(v) + 's'; }
      }));
    });

    /* 02 四连图（对数归一） */
    function logBars(host, values, unit, color, digits) {
      if (!host) return;
      var pos = values.filter(function (v) { return v > 0; });
      if (!pos.length) return;
      var hi = Math.log10(Math.max.apply(null, pos));
      var lo = Math.log10(Math.min.apply(null, pos));
      var items = rows.map(function (r, i) {
        var v = values[i];
        var f = (v > 0 && hi > lo) ? (Math.log10(v) - lo) / (hi - lo) : 0;
        return {
          name: r.label, value: Math.max(0, f) * 100, max: 100, raw: v,
          text: (digits ? n(v, digits) : String(v)) + (unit || ''),
          color: color
        };
      }).sort(function (a, b) { return b.raw - a.raw; });
      if (items.length) items[0].color = '#ff8faa';
      host.appendChild(CH.hbars({ items: items, w: Math.floor(W / 2) - 24, labelW: 66, rowH: 17 }));
    }
    logBars(root.querySelector('#vibPk'), rows.map(function (r) { return r.peak; }), '', '#38d9f5', 4);
    logBars(root.querySelector('#vibRms'), rows.map(function (r) { return r.rmsMax || 0; }), '', '#5fd08a', 4);
    logBars(root.querySelector('#vibCv'), rows.map(function (r) { return r.cv; }), '', '#ffc251', 2);
    logBars(root.querySelector('#vibNpk'), rows.map(function (r) { return r.n; }), '', '#7f7f7f', 0);

    /* 03 沿桥纵向 */
    var box03 = root.querySelector('#vib03');
    if (box03) {
      var secs = [];
      rows.forEach(function (r) { if (secs.indexOf(r.sec) < 0) secs.push(r.sec); });
      secs.sort();
      var xs = {};
      secs.forEach(function (s, i) { xs[s] = i; });
      var a01 = [], a02 = [], meanLine = [];
      secs.forEach(function (s) {
        var g = rows.filter(function (r) { return r.sec === s; });
        g.sort(function (x, y) { return String(x.code).localeCompare(String(y.code)); });
        if (g[0]) a01.push([xs[s], g[0].peak]);
        if (g[1]) a02.push([xs[s], g[1].peak]);
        meanLine.push([xs[s], avg(g.map(function (r) { return r.peak; }))]);
      });
      box03.appendChild(CH.lineChart({
        w: W, h: 220, cssH: 220, yLog: true, yTicks: 5, xLabels: secs.length - 1,
        xFormat: function (v) { var i = Math.round(v); return secs[i] != null ? secs[i] : ''; },
        xDomain: [0, Math.max(1, secs.length - 1)],
        series: [
          { pts: meanLine, color: '#ffd479', w: 2, dots: true, r: 3 },
          { pts: a01, color: '#38d9f5', w: 0, dots: true, r: 4 },
          { pts: a02, color: '#ff9f4a', w: 0, dots: true, r: 4 }
        ]
      }));
      var lg3 = document.createElement('div');
      lg3.className = 'legend-row';
      lg3.innerHTML = '<span><i style="background:#ffd479"></i>断面均值</span>'
        + '<span><i style="background:#38d9f5"></i>上游 -01</span>'
        + '<span><i style="background:#ff9f4a"></i>下游 -02</span>';
      box03.parentNode.appendChild(lg3);
    }

    /* 04 波形 / 包峰值序列 / 频谱 */
    if (rawCh) {
      var raw = rawCh.raw || [];
      var wf = fs || 20;
      var boxW = root.querySelector('#vibWave');
      if (boxW && raw.length > 8) {
        var seg = raw.slice(0, Math.min(raw.length, Math.round(wf * 20)));
        var capW = document.createElement('div');
        capW.className = 'vib-nm';
        capW.style.marginTop = '4px';
        capW.textContent = '① 拼接连续波形（前 ' + (seg.length / wf).toFixed(0) + ' s，共 '
          + raw.length + ' 点 @ ' + wf.toFixed(0) + ' Hz）';
        boxW.parentNode.insertBefore(capW, boxW);
        boxW.appendChild(CH.lineChart({
          w: W, h: 190, cssH: 190,
          series: [{
            pts: seg.map(function (v, i) { return [i / wf, v]; }),
            color: '#38d9f5', w: 1, dots: false, area: true
          }],
          xFormat: function (v) { return v.toFixed(0) + 's'; }, xLabels: 5, yTicks: 4
        }));
      }
      var boxS = root.querySelector('#vibSeq');
      if (boxS) {
        boxS.appendChild(CH.lineChart({
          w: Math.floor(W / 2) - 24, h: 170, cssH: 170, yTicks: 3,
          pad: { l: 42, r: 10, t: 10, b: 22 },
          series: [{ pts: AX.pts(rawCh.series), color: '#ff8faa', w: 1.2, dots: false }],
          xFormat: function (v) { return Math.round(v) + 's'; }, xLabels: 3
        }));
      }
      var boxF = root.querySelector('#vibSpec');
      if (boxF && raw.length >= 64) {
        var mu0 = avg(raw);
        var sig = raw.map(function (v) { return v - mu0; });
        var mag = fftMag(sig);
        var df = wf / (mag.length * 2);
        var ptsF = [], maxF = Math.min(mag.length, Math.round(10 / df));
        for (var q = 1; q < maxF; q++) ptsF.push([q * df, mag[q]]);
        boxF.appendChild(CH.lineChart({
          w: Math.floor(W / 2) - 24, h: 170, cssH: 170, yTicks: 3,
          pad: { l: 48, r: 10, t: 10, b: 22 },
          series: [{ pts: ptsF, color: '#5fd08a', w: 1.2, dots: false, area: true }],
          xFormat: function (v) { return v.toFixed(1); }, xLabels: 5
        }));
        var pk = ptsF.slice().sort(function (a, b) { return b[1] - a[1]; })[0];
        if (pk) {
          var capF = document.createElement('div');
          capF.className = 'vib-nm';
          capF.textContent = '主频 ' + pk[0].toFixed(2) + ' Hz（幅值 ' + pk[1].toExponential(1) + ' g）';
          boxF.parentNode.appendChild(capF);
        }
      }
    }

    /* 05 同断面一致性 */
    var box05 = root.querySelector('#vib05');
    if (box05) {
      var g2 = {}, order = [];
      rows.forEach(function (r) {
        if (!g2[r.sec]) { g2[r.sec] = []; order.push(r.sec); }
        g2[r.sec].push(r);
      });
      order.sort();
      var groups = order.map(function (s) {
        var g = g2[s].slice().sort(function (x, y) { return String(x.code).localeCompare(String(y.code)); });
        return { name: s, a: g[0] ? g[0].mean : 0, b: g[1] ? g[1].mean : 0 };
      });
      box05.appendChild(CH.groupBars({ groups: groups, w: W, labelW: 56, valW: 56, rowH: 30, yLog: true }));
      var lg5 = document.createElement('div');
      lg5.className = 'legend-row';
      lg5.innerHTML = '<span><i style="background:#38d9f5"></i>-01 均值</span>'
        + '<span><i style="background:#ff9f4a"></i>-02 均值</span>'
        + '<span>右侧为两路均值比，≥4 倍标红</span>';
      box05.parentNode.appendChild(lg5);
    }
  }

  /* ============================================================
     A8 规则集
     ============================================================ */
  function renderRules(root) {
    root.innerHTML = '<div class="sec-title">适用口径（《城市桥梁评价智能体评分算法》）</div>'
      + '<table class="dt"><thead><tr><th>养护类别</th><th>处理方式</th></tr></thead><tbody>'
      + '<tr><td style="color:#8fd7ff;font-weight:700">Ⅰ 类</td><td>按式(1) 照常评分；另按《养护标准》§4.3/§4.4 给结构安全状况初判（合格 / 不合格）</td></tr>'
      + '<tr><td style="color:#38d9f5;font-weight:700">Ⅱ ~ Ⅴ 类</td><td>按式(1) 计算 Dr，再与 BCI*、BSI* 取最小值作为最终得分</td></tr>'
      + '</tbody></table>'
      + '<div class="sec-title">式(1) 与表 1 权重</div>'
      + '<table class="dt"><thead><tr><th>类别</th><th>项</th><th class="mono">权重</th><th>说明</th></tr></thead><tbody>'
      + '<tr><td rowspan="3">检测指标</td><td>上部结构 BCI_s</td><td class="mono">0.344</td><td>s，含主梁与缆索</td></tr>'
      + '<tr><td>下部结构 BCI_x</td><td class="mono">0.344</td><td>x，含塔、墩、锚碇</td></tr>'
      + '<tr><td>桥面系 BCI_m</td><td class="mono">0.172</td><td>m，含伸缩缝与附属</td></tr>'
      + '<tr><td rowspan="2">监测指标</td><td>自振频率 D_MFR</td><td class="mono">0.110</td><td>D_IFR，按表 2 计分</td></tr>'
      + '<tr><td>冲击系数 D_MIF</td><td class="mono">0.030</td><td>D_IIF，按表 3 计分</td></tr>'
      + '</tbody></table>'
      + '<div class="note-box info"><b>两处文档问题（已按工程惯例处理）：</b><br>'
      + '① 式(1) 三项均写作 BCI（BCI_m / BCI_s / BCI_x），按 CJJ 99 记法，上部、下部应为 <b>BSI_s、BSI_x</b>，只有桥面系是 BCI_m —— 判为笔误。<br>'
      + '② 表 3 的 μ_mi/μ_di &gt; 1.40 档只给 [0, 40) 开区间，无上界，本系统按 20 分/0.20 同斜率线性降至 0。</div>'
      + '<div class="sec-title">技术状况等级（CJJ 99-2017 表 3.0.5-1）</div>'
      + '<table class="dt"><thead><tr><th>等级</th><th>区间</th><th>状态</th><th>处置要求</th></tr></thead><tbody>'
      + [['A', '90–100', '完好', '正常养护'], ['B', '80–＜90', '良好', '正常养护，关注个别构件'],
      ['C', '66–＜80', '合格', '需保养维修，1 年内安排'], ['D', '50–＜66', '不合格', '需中修或大修，限载观察'],
      ['E', '＜50', '危险', '立即封闭交通，专项检测']]
        .map(function (r, i) {
          var g = r[0];
          return '<tr><td style="color:' + gc(g) + ';font-weight:800">' + g + '</td><td class="mono">' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>';
        }).join('') + '</tbody></table>'
      + '<div class="sec-title">监测报警分级判据</div>'
      + '<table class="dt"><thead><tr><th>级别</th><th>判定条件</th><th>响应</th><th>阈值来源</th></tr></thead><tbody>'
      + '<tr><td style="color:#ffc251;font-weight:700">三级预警</td><td>|x|<sub>max</sub> ≥ L<sub>3</sub></td><td>记录、加密观测</td><td>接入阈值表 监测级别 3</td></tr>'
      + '<tr><td style="color:#ff9351;font-weight:700">二级报警</td><td>|x|<sub>max</sub> ≥ L<sub>2</sub></td><td>24 h 内现场核查</td><td>接入阈值表 监测级别 2</td></tr>'
      + '<tr><td style="color:#ff5f6d;font-weight:700">一级报警</td><td>|x|<sub>max</sub> ≥ L<sub>1</sub></td><td>立即限载/封桥，专项检测</td><td>接入阈值表 监测级别 1</td></tr>'
      + '</tbody></table>'
      + '<div class="note-box info"><b>分级规则：</b>逐级比对，取达到的最高级别；某级阈值缺失就不判到该级（不推定）；'
      + '阈值退化为零宽区间（上下限相等）视为该级无效。<br>'
      + '<b>规范依据：</b>GB 50982-2014 第 3.1.8 条（强制）要求"应设定监测预警值，并满足工程设计及被监测对象的控制要求"；'
      + 'JT/T 1037-2016 第 8.3 节设黄/红两级并分项给倍率（位移/变形 0.8 倍设计值起报、索应力 0.95 倍、车辆荷载 1.5/2.0 倍、'
      + '风速 0.8/1.0 倍、冲刷 0.7 倍）；JT/T 1037-2022 改为"超限报警"。'
      + '<br><b>本系统不采用跨指标的统一倍率</b>，直接读该测点各级阈值，便于追溯到具体阈值记录。'
      + '正式评定仍应以本桥设计文件 / 监测方案的控制值为准。</div>'
      + '<div class="sec-title">数据质量判据</div>'
      + '<table class="dt"><thead><tr><th>校验项</th><th>判据</th><th>处理</th></tr></thead><tbody>'
      + '<tr><td>物理量级</td><td>实测幅值偏离指标工程量级区间</td><td>判为量纲/标定异常，排除评分</td></tr>'
      + '<tr><td>阈值有效性</td><td>上下限相等（零宽区间）或无阈值</td><td>回退上级阈值，仍无则标记缺失</td></tr>'
      + '<tr><td>通道相关性</td><td>同断面同指标 r &lt; 0.3</td><td>判为传感器异常，建议剔除</td></tr>'
      + '<tr><td>样本量</td><td>当期报文 ≤ 2 条</td><td>标记样本不足，不参与趋势判断</td></tr>'
      + '<tr><td>系统性超限</td><td>同断面 ≥50% 通道同步超二级</td><td>优先怀疑阈值失配，人工复核</td></tr>'
      + '</tbody></table>'
      + '<div class="note-box info"><b>方法学说明：</b>本系统采用「定检基线 + 监测修正」双源融合架构。'
      + '定检（CJJ 99 / JTG 5210）反映结构本体的既有状况，是法定评定依据；'
      + '监测数据反映实时荷载效应与劣化趋势，用于动态修正与预警。'
      + '两者不可互相替代：只有定检会漏掉突发损伤，只有监测则会因阈值误差产生大量误报。</div>';
  }

  /* ============================================================
     弹层控制
     ============================================================ */
  var RENDER = {
    score: renderScore, threshold: renderThreshold, corr: renderCorr,
    anomaly: renderAnomaly, cable: renderCable, temp: renderTemp, trend: renderTrend,
    vib: renderVib, rules: renderRules,
    plan: function (root) { Plan.render(root); },
    report: function (root) { Report.render(root); }
  };

  function open(key) {
    A = UI.getA();
    AL = BA.alarms(A);
    cur = key;
    var meta = ALGO_META[key];
    document.getElementById('mTitle').textContent = meta.title;
    document.getElementById('mSub').textContent = meta.sub;
    var nav = document.getElementById('mNav');
    nav.innerHTML = UI.ALGOS.filter(function (a) { return !a.hidden; }).map(function (a) {
      return '<div class="nav-item' + (a.key === key ? ' on' : '') + '" data-k="' + a.key + '"><div class="n1">' + a.name + '</div><div class="n2">' + a.id + ' · ' + a.sub + '</div></div>';
    }).join('');
    nav.querySelectorAll('.nav-item').forEach(function (d) {
      d.onclick = function () { open(d.getAttribute('data-k')); };
    });
    var host = document.getElementById('algoHost');
    if (host) host.setAttribute('data-mode', key === 'report' ? 'paper' : (key === 'plan' ? 'wide' : ''));
    var main = document.getElementById('mMain');
    main.innerHTML = '';
    main.scrollTop = 0;
    if (!A.channels.length && key !== 'rules' && !(key === 'vib' && global.BRIDGE_LIVE && Object.keys(global.BRIDGE_LIVE.channels || {}).length)) {
      main.innerHTML = '<div class="empty-tip">当前数据没有可分析的监测通道</div>';
    } else { RENDER[key](main); }
    if (UI.onAlgoOpen) UI.onAlgoOpen(key);
  }
  function close() { if (UI.onAlgoClose) UI.onAlgoClose(); }

  var rzTm = null;
  window.addEventListener('resize', function () {
    var host = document.getElementById('algoHost');
    if (!host || host.offsetParent === null) return;
    clearTimeout(rzTm);
    rzTm = setTimeout(function () { open(cur); }, 240);
  });

  global.Algo = { open: open, close: close };

})(window);
