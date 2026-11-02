(function () {
  "use strict";
  var timer;
  // Metadata copied from the unchanged vibration snapshot; waveforms load only for V1.
  var vibrationWindow = {"t0": 1793266349000, "t1": 1793284728000};
  var vibrationPromise;
  window.loadAnalysisVibration = function () {
    if (vibrationPromise) return vibrationPromise;
    vibrationPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      var timeout = setTimeout(function () { finish(new Error("timeout")); }, 30000);
      function finish(error) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) {
          script.remove();
          vibrationPromise = null;
          reject(error);
        } else {
          window.analysisVibrationLoaded = true;
          resolve();
        }
      }
      script.src = "js/live-vib.js";
      script.onload = function () { finish(window.BRIDGE_LIVE ? null : new Error("missing snapshot")); };
      script.onerror = function () { finish(new Error("load failed")); };
      document.head.appendChild(script);
    });
    return vibrationPromise;
  };
  window.App = { toast: function (text) {
    var el = document.getElementById("analysisToast"); el.textContent = text;
    clearTimeout(timer); timer = setTimeout(function () { el.textContent = ""; }, 3500);
  }};
  function format(t) { return new Date(t).toLocaleString("zh-CN", {timeZone:"Asia/Shanghai", hour12:false}); }
  var times = Object.values(BRIDGE_DATA.series).flat().map(function (p) { return p[0]; }).filter(Number.isFinite);
  var range = times.length ? format(Math.min.apply(null,times)) + " — " + format(Math.max.apply(null,times)) : "未提供";
  document.getElementById("snapshotTime").textContent = "万福大桥 · 监测数据：" + range + " · 振动数据：" + format(vibrationWindow.t0) + " — " + format(vibrationWindow.t1) + "（北京时间）";
  UI.ALGOS = UI.ALGOS.filter(function (a) { return !a.hidden; });
  UI.ensure();
  Algo.open("score");
  parent.postMessage({type:"wanfu-analysis-ready"}, "*");
})();
