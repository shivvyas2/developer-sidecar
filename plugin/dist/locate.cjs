"use strict";

// packages/shared/src/home.ts
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var DEFAULT_PORT = 7377;
function sidecarHome(env = process.env) {
  return env.SIDECAR_HOME ?? (0, import_node_path.join)((0, import_node_os.homedir)(), ".developer-sidecar");
}
function readTrim(path) {
  try {
    return (0, import_node_fs.readFileSync)(path, "utf8").trim();
  } catch {
    return null;
  }
}
function readToken(home) {
  const t = readTrim((0, import_node_path.join)(home, "token"));
  return t && /^[0-9a-f]{64}$/.test(t) ? t : null;
}
function ownPort(home) {
  const raw = readTrim((0, import_node_path.join)(home, "port"));
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}
function readPort(home) {
  return ownPort(home) ?? DEFAULT_PORT;
}

// plugin/src/locate.ts
function locate(home) {
  return { port: readPort(home), token: readToken(home) };
}

// plugin/src/locate-cli.ts
try {
  process.stdout.write(JSON.stringify(locate(sidecarHome())));
} catch {
  process.stdout.write("{}");
}
