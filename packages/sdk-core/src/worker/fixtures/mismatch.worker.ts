// Announces a protocol version the page doesn't speak.
postMessage({ protocol: "hm-rpc", version: 999, type: "ready" });
