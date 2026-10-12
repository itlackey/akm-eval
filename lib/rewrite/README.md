# lib/rewrite

A seeded rewrite of the names, tool names, hosts, ids, dates, numbers and versions in a text. The generate scripts use it to make each eval's custom corpus from the public cases.

It is a light perturbation, not held-out data: about 3 to 5 percent of the words change, and the prose, the structure and the labels stay. A model that has memorised a case can still recognise it. By default it renames real tools too (`uv run` becomes a made-up word), which makes a case harder for that reason alone; with `--tools keep` the real tools keep their names, so a gap between the public and the custom score is cleaner.

The same original always gets the same replacement, in every file of a run, and the mapping is written out so that labels and queries can be rewritten to match.

## Use

```
bun lib/rewrite/rewrite.ts --seed 42 --map map.json [--tools rename|keep] <in> <out>
```

- `<in>` is a file or a folder; `<out>` must be outside it.
- `--seed` is a non-negative integer of up to 64 bits, optional when the map exists.
- `--map` is read if it exists and written at the end; a new run adds to it.
- `--min-count` is how often a capitalised word must appear to count as a name (default 2).
- `--keep-values` keeps numbers and versions, for data whose answers are counted from the text (LongMemEval). Ports still change.
- `--tools rename` (default) renames every tool in `TOOLS` in `lexicon.ts`; `keep` renames only the made-up ones (`INVENTED_TOOLS`). The map records the mode, and asking a map for the other mode is an error.

To rewrite labels to match a corpus, pass the same map:

```
bun lib/rewrite/rewrite.ts --seed 42 --map map.json corpus out/corpus
bun lib/rewrite/rewrite.ts --map map.json labels out/labels
```

A `.json` or `.jsonl` file is rewritten string by string; keys, numbers and layout stay. The same seed and input always give the same output. `bun test lib/rewrite` runs the tests.

## What it changes

- Names of people, organisations and projects that the text writes as names (see "How names are found").
- Tool, product and vendor names in every form: `Docker`, `DOCKER_HOST`, `docker-compose`, `DockerClient`, `qwen3`.
- Numbers and versions (`18`, `1,081`, `512MB`, `85%`, `0.65`, `v0.9.26`), keeping their order (see "Numbers").
- Hostnames, IPv4 addresses (a private one stays private) and ports; UUIDs and hex ids of 16 digits or more, keeping length and case.
- Dates, all shifted by the same number of days.
- File and folder names, so links still resolve; extensions stay.

A renamed word has as many letters as the original, and a changed number as many digits.

## What it leaves

- The keep list, `TECH` in `lexicon.ts`: the words a text rests on (programming languages, file formats, protocols, operating systems, core commands such as git, npm and bash, and tool names that are also ordinary words).
- Single digits, years, HTTP status codes, exit codes, the units of time 7, 12, 24, 60 and 365, and numbers that number something (`Step 12`, list items).
- The keys of the PDF and PDF/X standards, licence names, hosts under well-known domains, `localhost` and documentation addresses, ports below 1024 and common database and model-server ports, short hex ids.
- Ordinary English words, and files that are not UTF-8 text.
- Secrets. This is not a redaction tool.

`--tools keep` leaves every real name in `TOOLS` as it is, `akm` included; the made-up tools of the extract sessions and of agent-ab are still renamed. Add a tool to `TOOLS`, or a word to `TECH`, to change what is renamed.

## Numbers

A part of two or more digits changes and keeps its digit count, so `85%` stays between 10 and 99. Each part changes under the parts before it, so `1.17.3` and `1.17` share their `1.17`. The numbers of a run with the same prefix and digit count are moved together by a seeded 10 to 40 percent and handed out by rank, so their order holds and no two become one: "up from 18 to 21" stays an increase. Decimal fractions are ordered as fractions (`8.25` stays below `8.375`). A port stays between 1024 and 65535. A group crowded with values has little room, so its numbers may move by one or two.

## How names are found

A capitalised word is a name when it is not a common word or a kept term, has four or more letters (three if it is a known given name or surname), appears capitalised at least once other than at the start of a sentence, appears at least `--min-count` times, and never appears as a plain lowercase word. It is then renamed in every form (`Acme`, `ACME`, `AcmeClient`, `acme_client`). A known given name or surname gets another from the same list; anything else a pronounceable made-up word.

## The map file

```
{ "version": 1, "seed": "42", "dateShiftDays": -214, "tools": "rename", "numbersAssigned": true,
  "words": { "acme": "apon" }, "hostWords": {}, "hosts": {}, "ips": {}, "ports": { "8080": "6371" },
  "uuids": {}, "hex": {}, "numbers": { "18": "21" } }
```

`words` lists every renamed name and tool. A saved map keeps the numbers of its first run (`numbersAssigned`), and a later run leaves a number the map lacks as it is.

## Known limits

- The rules are heuristics for English text written in A to Z. A capitalised heading word missing from the lists can be renamed: add it to `COMMON` in `lexicon.ts`.
- A tool missing from `TOOLS` is renamed in both modes when written capitalised, and missed when written only in lowercase.
- Names that are also common words (`Will`, `Apple`), names seen once, and names glued into one lowercase word are not found.
- Weekday names do not follow the date shift; `Month YYYY` and `MM/DD/YYYY` dates are left alone. IPv6 is not handled.
- Bare hostnames are found only under common top-level domains.
