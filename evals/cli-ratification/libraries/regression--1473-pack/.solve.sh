#!/bin/bash
# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.
set -euo pipefail
cd /work/orchid
akm curate "wicket drain procedure" --pack 1500 --format jsonl > raw.out
# a build that ignores --format prints one pretty-printed array; either shape becomes one object per line
node -e 'const t=require("fs").readFileSync("raw.out","utf8");let r;try{r=JSON.parse(t)}catch{r=t.split("\n").filter(Boolean).map((l)=>JSON.parse(l))}for(const x of Array.isArray(r)?r:[r])console.log(JSON.stringify({ref:x.ref,content:x.content}))' > context.jsonl
rm raw.out
