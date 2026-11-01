window.addEventListener("error", function () { parent.postMessage({type:"wanfu-analysis-error"}, "*"); });
window.addEventListener("unhandledrejection", function () { parent.postMessage({type:"wanfu-analysis-error"}, "*"); });
