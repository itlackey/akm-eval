# lib/rewrite

A seeded rewrite of incidental identifiers. The generate scripts use it to turn public eval assets into private ones. Names, hosts, ids and dates change. The meaning and the difficulty stay the same.

The same original always gets the same replacement, in every file of one run. The mapping is written out, so labels, cases and queries can be rewritten to match.

## Use

```
bun lib/rewrite/rewrite.ts --seed 42 --map map.json <in> <out>
```

- `<in>` is a file or a folder. `<out>` is where the result goes. The output must be outside the input.
- `--seed` is a non-negative integer, up to 64 bits. It is optional when the map already exists.
- `--map` is the mapping file. It is read if it exists, and always written at the end. A new run adds to it.
- `--min-count` is how often a capitalised word must appear to count as a name. The default is 2.

To rewrite labels to match a corpus, pass the same map:

```
bun lib/rewrite/rewrite.ts --seed 42 --map map.json corpus out/corpus
bun lib/rewrite/rewrite.ts --map map.json labels out/labels
```

The same seed and the same input always give the same output. Run `bun test lib/rewrite` for the tests.

## What it changes

- Person, organisation and project names that are not well-known tools. See "How names are found".
- Words in the name part of email addresses: they are names, so they change everywhere.
- Words in hostnames change inside hostnames. In the text they change only when the text writes them as a name (capitalized mid-sentence, never lowercase), so an ordinary word such as `garden` in `garden.acme.io` stays as it is in prose. Generic labels (`www`, `api`, `docs`, `lab`) and hosts under well-known domains are left alone.
- Hostnames and URL hosts, IPv4 addresses and ports. An address stays in its class: a private one stays private.
- UUIDs and long hex ids (16 hex digits or more). They keep their length and case.
- Dates. Every date moves by the same number of days, so gaps and order are kept.
- File and folder names, with the same map, so links between files still resolve. Extensions are kept.

## What it leaves

- Well-known tools, languages, commands, file formats and ordinary English words (the lists are in `lexicon.ts`).
- Hosts under well-known domains such as `github.com`, and `localhost`, `example.com` and the like.
- Loopback, link-local and documentation addresses, public DNS servers and the Docker bridge address. Ports below 1024 and common database and model-server ports.
- Short hex ids, version numbers, and years on their own.
- Files that are not UTF-8 text, which are copied. Secrets and passwords. This is not a redaction tool.

## How names are found

The names come from the input itself. A capitalised word is a name when all of these hold:

1. It is not a common word or a well-known tool, it has three or more letters, and it has no long common ending such as `-tion` or `-ment`.
2. It appears capitalised at least once other than at the start of a sentence. A colon, a table cell, a quote or a bracket opens a new sentence. Headings, Title Case lines, one-word lines, and the second word of a Title Case phrase of ordinary words do not count.
3. It appears at least `--min-count` times in all, in any form, identifiers included.
4. It never appears as a plain lowercase word. Paths and email addresses do not count.

A name is renamed wherever it appears as a part of a word: `Acme`, `acme`, `ACME`, `AcmeClient`, `acme_client`, `acme-corp`. A given name or surname that is in the built-in lists gets another name from the same list. Any other name gets a pronounceable word of the same length.

## The map file

```
{ "version": 1, "seed": "42", "dateShiftDays": -214,
  "words": { "acme": "apon" },      "hosts": { "wiki.acme.dev": "wiki.apon.dev" },
  "ips": { ... }, "ports": { ... }, "uuids": { ... }, "hex": { ... } }
```

Look at `words` after a run. It lists every name that was renamed.

## Known limits

- The rules are heuristics for English text, and names are found only when they are written with the letters A to Z. A word that is missing from the lists, and is capitalised in the right places, is renamed. Add it to `COMMON` or `TECH` in `lexicon.ts` to stop that.
- Names that are also common words (`Will`, `Mark`, `Apple`) are never renamed. A name seen once, a name only at the start of sentences, and a name only in capitals are not found.
- A name glued into one lowercase word (`acmecorp`) is a different word from `Acme Corp`. So are plurals.
- Weekday names do not follow the date shift. Dates written `Month YYYY`, as a number, or as `MM/DD/YYYY` are left alone.
- A four-part number such as `1.2.3.4` is taken for an IP address unless `version`, `release`, `build` or a comparison such as `==` comes just before it. IPv6 is not handled.
- Bare hostnames are found only under `.com .net .org .io .dev .app .ai .co .xyz .tech .cloud .info .biz .edu .gov .lan .local .internal`, in lowercase. In a URL with a common scheme any host is found.
- A public site that is not in `WELL_KNOWN_DOMAINS` in `lexicon.ts` is renamed like a private one.
- Secrets and passwords are not detected. Read the output before you publish it.
