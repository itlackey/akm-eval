// Logging proxy: forwards to the lab, records what the model server sees. usage: node proxy.mjs LOG PORT
import http from "node:http"; import https from "node:https"; import fs from "node:fs";
const [log, port] = [process.argv[2], Number(process.argv[3])];
const UP = new URL(process.env.UPSTREAM);
http.createServer((req, res) => {
  const chunks = []; req.on("data", d => chunks.push(d));
  req.on("end", () => {
    const body = Buffer.concat(chunks); let j = {}; try { j = JSON.parse(body); } catch {}
    const msgs = j.messages || [];
    const text = r => msgs.filter(m => m.role === r).map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n");
    const sys = text("system");
    const row = { t: Date.now(), url: req.url, stream: !!j.stream, temperature: j.temperature, tools: (j.tools || []).length, sysChars: sys.length, userChars: text("user").length, title: /^You are a title generator/.test(sys), sysHead: sys.slice(0, 90) };
    const hdr = { "content-type": "application/json", "content-length": body.length, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) };
    const t0 = Date.now();
    const up = https.request({ hostname: UP.hostname, port: UP.port || 443, path: UP.pathname.replace(/\/$/, "") + req.url.replace(/^\/v1/, ""), method: req.method, headers: hdr }, ur => {
      res.writeHead(ur.statusCode, ur.headers); const buf = [];
      ur.on("data", d => { buf.push(d); res.write(d); });
      ur.on("end", () => { res.end(); const s = Buffer.concat(buf).toString(); const pt = [...s.matchAll(/"prompt_tokens":\s*(\d+)/g)].pop(), ct = [...s.matchAll(/"completion_tokens":\s*(\d+)/g)].pop();
        row.prompt_tokens = pt ? Number(pt[1]) : undefined; row.completion_tokens = ct ? Number(ct[1]) : undefined;
        row.status = ur.statusCode; row.ms = Date.now() - t0; if (process.env.SAVE_SYS && !fs.existsSync(process.env.SAVE_SYS) && !row.title && sys.length) fs.writeFileSync(process.env.SAVE_SYS, sys); fs.appendFileSync(log, JSON.stringify(row) + "\n"); });
    });
    up.on("error", e => { res.writeHead(502); res.end(String(e)); });
    up.end(body);
  });
}).listen(port, "127.0.0.1");
