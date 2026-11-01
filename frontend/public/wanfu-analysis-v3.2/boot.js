(function () {
  "use strict";
  var timer;
  window.App = { toast: function (text) {
    var el = document.getElementById("analysisToast"); el.textContent = text;
    clearTimeout(timer); timer = setTimeout(function () { el.textContent = ""; }, 3500);
  }};
  function format(t) { return new Date(t).toLocaleString("zh-CN", {timeZone:"Asia/Shanghai", hour12:false}); }
  var times = Object.values(BRIDGE_DATA.series).flat().map(function (p) { return p[0]; }).filter(Number.isFinite);
  var range = times.length ? format(Math.min.apply(null,times)) + " — " + format(Math.max.apply(null,times)) : "未提供";
  document.getElementById("snapshotTime").textContent = "万福大桥 · 监测数据：" + range + " · 振动数据：" + format(BRIDGE_LIVE.window.t0) + " — " + format(BRIDGE_LIVE.window.t1) + "（北京时间）";
  UI.ALGOS = UI.ALGOS.filter(function (a) { return !a.hidden; });
  UI.ensure();
  Algo.open("score");
  parent.postMessage({type:"wanfu-analysis-ready"}, "*");
})();
