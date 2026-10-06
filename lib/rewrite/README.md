# lib/rewrite

A seeded rewrite of the names, tool names, hosts, ids, dates, numbers and versions in a text. The generate scripts use it to turn public eval assets into private ones. The meaning and the difficulty stay the same: names change, numbers change but keep their order and their size, and the words a text rests on (languages, formats, protocols, core commands) stay.

The same original always gets the same replacement, in every file of one run. The mapping is written out, so labels, cases and queries can be rewritten to match.

Most of a text is ordinary prose, and the rewrite leaves prose alone. On this repository's own evals it changes about 3 to 5 percent of the words. Before it rewrote numbers, versions and tool names it changed about 1 percent of them in most evals.

## Use

```
bun lib/rewrite/rewrite.ts --seed 42 --map map.json <in> <out>
```

- `<in>` is a file or a folder. `<out>` is where the result goes. The output must be outside the input.
- `--seed` is a non-negative integer, up to 64 bits. It is optional when the map already exists.
- `--map` is the mapping file. It is read if it exists, and always written at the end. A new run adds to it.
- `--min-count` is how often a capitalised word must appear to count as a name. The default is 2.
- `--keep-values` keeps numbers and versions as they are. Use it for data whose answers are counted from the text, such as LongMemEval's "how many days". Names, tool names, hosts, ids and dates are still rewritten.

To rewrite labels to match a corpus, pass the same map:

```
bun lib/rewrite/rewrite.ts --seed 42 --map map.json corpus out/corpus
bun lib/rewrite/rewrite.ts --map map.json labels out/labels
```

A `.json` or `.jsonl` file is rewritten string by string. Its keys, its numbers and its layout stay, so a threshold such as `"max_ratio": 0.78` does not move.

The same seed and the same input always give the same output. Run `bun test lib/rewrite` for the tests.

## What it changes

- Person, organisation and project names that the text writes as names. See "How names are found".
- Tool, product, vendor and project names, in every form: `Docker`, `docker`, `DOCKER_HOST`, `docker-compose`, `DockerClient`, `GitHubActions`, `qwen3`. An identifier written in lowercase follows the identifier: `assertakmassetwrite` for `assertAkmAssetWrite`. The names are in `TOOLS` in `lexicon.ts`. See "Tool names".
- Numbers and versions: counts, sizes, durations, percentages and decimals (`18`, `1,081`, `512MB`, `85%`, `0.65`), and versions (`1.17.3`, `v0.9.26`, `0.9.0-rc.13`). See "Numbers".
- Words in the name part of email addresses: they are names, so they change everywhere.
- Words in hostnames change inside hostnames. In the text they change only when the text writes them as a name (capitalized mid-sentence, never lowercase), so an ordinary word such as `garden` in `garden.acme.io` stays as it is in prose. Generic labels (`www`, `api`, `docs`, `lab`) and hosts under well-known domains are left alone.
- Hostnames and URL hosts, IPv4 addresses and ports. An address stays in its class: a private one stays private.
- UUIDs and long hex ids (16 hex digits or more). They keep their length and case.
- Dates. Every date moves by the same number of days, so gaps and order are kept.
- File and folder names, with the same map, so links between files still resolve. Extensions are kept.

A renamed word has the same number of letters as the word it replaces, and a changed number has the same digits, so a field that must be 20 to 400 characters long still is.

## What it leaves

- The keep list: the words a text rests on. See "Tool names".
- Single digits, years, and the numbers that carry a meaning of their own. See "Numbers".
- Hosts under well-known domains such as `github.com` or `api.openai.com`, and `localhost`, `example.com` and the like. A real endpoint stays real.
- Loopback, link-local and documentation addresses, public DNS servers and the Docker bridge address. Ports below 1024 and common database and model-server ports.
- Short hex ids.
- Ordinary English words, and tool names that are also ordinary words.
- Files that are not UTF-8 text, which are copied. Secrets and passwords. This is not a redaction tool.

## Tool names

A tool, product, vendor or project name is renamed everywhere. A short list of terms is kept, because the text's meaning rests on them: a reader, or a model, has to know what `git rebase`, `YAML` or `HTTP 404` mean for the text to make sense. This is the keep list. It is `TECH` in `lexicon.ts`:

- Programming languages and shells: python java javascript typescript rust go golang ruby php swift kotlin scala perl lua haskell elixir erlang clojure dart julia bash zsh fish sh powershell sql html css sass scss csharp cpp objective fortran cobol assembly wasm webassembly solidity matlab
- File formats and standard file names: markdown yaml json jsonl toml xml csv tsv graphql protobuf latex openapi pdf png jpeg jpg gif svg webp mp3 mp4 zip gz tgz iso unicode ascii utf readme license licence changelog makefile dockerfile gemfile procfile
- Protocols and standards: http https ftp smtp imap oauth saml jwt ssh ssl tls ntp dns dhcp tcp udp grpc websocket kerberos mcp acp lsp
- Operating systems: linux ubuntu debian fedora centos rhel arch alpine nixos macos windows android ios wsl
- Core commands and package managers: git grep sed awk curl wget jq yq tar gzip unzip chmod chown sudo rsync cron crontab systemd apt brew yum dnf pacman snap flatpak make cmake ninja gcc clang llvm rustc node nodejs npm npx pip cargo
- The words of programming: promise array map set object string number boolean null undefined
- Names of tools that are also ordinary words, so renaming one would change the prose around it: next solid express flask spring rails expo fly railway harbor beam bench swe tau goose zed paged terminal compose cursor signal matrix meta edge together teams linear zoom notion slack discord chef puppet vagrant packer apple amazon google intel arm risc amd excel word outlook sap grok pillow webview chroma pulsar zookeeper prettier bootstrap rollup storybook mocha helm drizzle transformers lambda llama

Everything in `TOOLS` is renamed. That is about 230 names: runtimes and package managers other than the core ones (Bun, Deno, pnpm, Yarn, uv), frameworks and libraries (React, Svelte, Playwright, Django, NumPy), infrastructure and services (Docker, Kubernetes, GitHub, AWS, Postgres, Redis, Kafka), AI vendors, models and tools (OpenAI, Claude, Qwen, Ollama, Codex), editors and apps, and the projects of this repository's own evals (akm, gutterpress, pagedjs, and the made-up projects of the extract sessions). A tool that is in neither list is only renamed when it also looks like a name (see "How names are found"). Add a tool to `TOOLS`, or a word to `TECH`, to change what is renamed.

A renamed tool gets a pronounceable word of the same length. `Qwen3` follows `qwen`: the digit stays.

## Numbers

A number is digits with an optional thousands comma and dotted parts, and an optional unit: `18`, `1,081`, `0.65`, `18.5%`, `512MB`, `30s`. A version is a number with dotted parts: `1.17.3`, `v0.9.26`, `0.9.0-rc.13`. They are changed the same way.

- A part of two or more digits changes. A part keeps its digits, so `85%` stays between 10 and 99 and `0.65` stays below 1. Commas, decimals and units stay.
- Each part is changed under the parts before it. In `1.17.3`, the `17` is one of the minor numbers of `1.x`, and the `3` is one of the patch numbers of `1.17`. So `1.17.3`, `1.17.x` and `1.17` share their `1.17`.
- The numbers of one run that have the same prefix and the same number of digits are changed together. Each is moved by a seeded factor, about 10 to 40 percent up or down, the moved values are put in order and handed out by rank, and neighbours that are equal are pushed apart. So the order is kept and no two numbers become one: "up from 18 to 21" stays an increase, `1.17.3` stays below `1.18.0`, and a candidate that changes `30000` to `3000` still changes it. Decimals with a different number of decimal places are not compared with each other (`0.65` and `0.9`).
- These stay as they are: single digits; a part with a leading zero (`0.05`, `007`); years from 1900 to 2199, since dates already move; HTTP status codes, process exit codes, 100, 1000 and powers of two (`KEEP_NUMBERS` in `lexicon.ts`); numbers that number something (`Step 12`, `Phase 3.1`, `§4.2`, `## 3.9 Title`, `12.` at the start of a list item); ranges (`10-20`); times (`10:30`); and anything that touches a letter, a slash, a colon or a dash, such as `P4`, `x264`, `%23` or `2025-03-12`. Ports are changed as ports.
- A number at the start of a wrapped line is a number: `reaches\n800. It returns` is not a list. A list item follows a blank line, another item or a line that ends in a colon.
- `--keep-values` turns all of this off.

## How names are found

The names come from the input itself. A capitalised word is a name when all of these hold:

1. It is not a common word or a kept term, it has three or more letters, and it has no long common ending such as `-tion` or `-ment`.
2. It appears capitalised at least once other than at the start of a sentence. A colon, a table cell, a quote or a bracket opens a new sentence. Headings, Title Case lines, one-word lines, and the second word of a Title Case phrase of ordinary words do not count.
3. It appears at least `--min-count` times in all, in any form, identifiers included.
4. It never appears as a plain lowercase word. Paths and email addresses do not count.

A name is renamed wherever it appears as a part of a word: `Acme`, `acme`, `ACME`, `AcmeClient`, `acme_client`, `acme-corp`. A given name or surname that is in the built-in lists gets another name from the same list. Any other name gets a pronounceable word of the same length. The names of tools do not need these rules: they are renamed whenever they appear.

## The map file

```
{ "version": 1, "seed": "42", "dateShiftDays": -214,
  "words": { "acme": "apon", "docker": "tukovu" }, "hosts": { "wiki.acme.dev": "wiki.apon.dev" },
  "ips": { ... }, "ports": { ... }, "uuids": { ... }, "hex": { ... },
  "numbers": { "18": "21", "0.9.15": "0.9.19" } }
```

Look at `words` after a run. It lists every name and tool that was renamed, and the lowercase forms of identifiers that were renamed. `numbers` lists every number that changed.

A saved map keeps the numbers of its first run. A number that it does not have, such as one that only a label has, is left as it is.

## Known limits

- The rules are heuristics for English text, and names are found only when they are written with the letters A to Z. A word that is missing from the lists, and is capitalised in the right places, is renamed. Add it to `COMMON` or `TECH` in `lexicon.ts` to stop that.
- A tool that is not in `TOOLS` and is written only in lowercase (`jobq`, `plm`) is not found. Add it to `TOOLS`.
- Names that are also common words (`Will`, `Mark`, `Apple`) are never renamed. A name seen once, a name only at the start of sentences, and a name only in capitals are not found.
- A name glued into one lowercase word (`acmecorp`) is a different word from `Acme Corp`. So are plurals. The exception is an identifier that the input also writes in CamelCase.
- A real endpoint stays real: a host under a well-known domain keeps its name, so `api.openai.com` stays when `openai` is renamed in the text.
- Weekday names do not follow the date shift. Dates written `Month YYYY`, as a number, or as `MM/DD/YYYY` are left alone. The time in a timestamp is left alone.
- A four-part number such as `1.2.3.4` is taken for an IP address unless `version`, `release`, `build` or a comparison such as `==` comes just before it. IPv6 is not handled.
- Bare hostnames are found only under `.com .net .org .io .dev .app .ai .co .xyz .tech .cloud .info .biz .edu .gov .lan .local .internal`, in lowercase. In a URL with a common scheme any host is found.
- A public site that is not in `WELL_KNOWN_DOMAINS` in `lexicon.ts` is renamed like a private one.
- Secrets and passwords are not detected. Read the output before you publish it.
