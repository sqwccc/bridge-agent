import "core-js/stable";

// Firefox 79 has AbortController, but lacks the newer AbortSignal helpers.
if (!AbortSignal.prototype.throwIfAborted) {
  Object.defineProperty(AbortSignal.prototype, "throwIfAborted", {
    configurable: true,
    writable: true,
    value: function (this: AbortSignal) {
      if (this.aborted) {
        throw (
          this.reason ||
          new DOMException("The operation was aborted", "AbortError")
        );
      }
    },
  });
}

if (!AbortSignal.any) {
  AbortSignal.any = function (signals: AbortSignal[]) {
    const controller = new AbortController();
    const listeners = new Map<AbortSignal, () => void>();
    const abort = (source: AbortSignal) => {
      controller.abort(source.reason);
      listeners.forEach((listener, signal) =>
        signal.removeEventListener("abort", listener),
      );
      listeners.clear();
    };
    for (const signal of signals) {
      if (signal.aborted) {
        abort(signal);
        break;
      }
      if (!listeners.has(signal)) {
        const listener = () => abort(signal);
        listeners.set(signal, listener);
        signal.addEventListener("abort", listener, { once: true });
      }
    }
    return controller.signal;
  };
}

// Also needed when a modern browser accesses the system over plain HTTP.
if (!crypto.randomUUID) {
  crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}
