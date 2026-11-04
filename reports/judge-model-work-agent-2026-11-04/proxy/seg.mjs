import fs from "node:fs";
const rows = fs.readFileSync("proxy-pr-harness.log","utf8").trim().split("\n").map(JSON.parse);
const probe = rows.filter(r=>r.sysChars===0 && r.userChars<=10);
const real = rows.filter(r=>!(r.sysChars===0 && r.userChars<=10));
const groups = {pr_harness: real.filter(r=>r.sysChars>100&&r.sysChars<=1000), pr_conn: real.filter(r=>r.sysChars<=100), main_harness_main: real.filter(r=>!r.title && r.sysChars>8000), main_harness_title: real.filter(r=>r.title), other: real.filter(r=>!r.title && r.sysChars>1000 && r.sysChars<=8000)};
for (const [k,v] of Object.entries(groups)) { const n=v.length||1, a=x=>(v.reduce((s,r)=>s+(r[x]||0),0)/n).toFixed(0);
 console.log(k, "calls", v.length, "prompt_tok", a("prompt_tokens"), "compl_tok", a("completion_tokens"), "sysChars", [...new Set(v.map(r=>r.sysChars))].sort((a,b)=>a-b).slice(0,4).join("/"), "..", Math.max(...v.map(r=>r.sysChars)), "ms", a("ms"), "temps", [...new Set(v.map(r=>r.temperature))].join(","), "tools", [...new Set(v.map(r=>r.tools))].join(",")); }
console.log("probes", probe.length);
