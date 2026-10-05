// Word lists for rewrite.ts. Everything is lowercase.
//
// COMMON: ordinary English words, and the headings and discourse words that
// documents capitalise. A capitalised word in this list is never a name.
// TECH: well-known tools, languages, file formats, protocols and vendors. These
// are never renamed. Both lists are short on purpose: a word missing from them is
// only renamed when it also looks like a name (see "How names are found" in the
// README).
// FIRST and SURNAMES: given names and family names. They are used to spot person
// names and as the pool that replacement names are drawn from.

const words = (s: string): Set<string> => new Set(s.split(/\s+/).filter(Boolean));

export const COMMON = words(`
a about above access account across action actions active actually add added additional additionally address admin advanced after again against agent agents all allow allows almost along alpha already also although always among an analysis and another answer answers any anyone anything api app application applications approach architecture are area args argument arguments around article as ask assets assumptions at audit author automatic automation available background backup base basic batch be because been before behavior being below benefits best beta between block body bonus boot both branch breaking brief browser budget bug bugs build builds bundle business but button by cache call calls can cancel cannot capacity case cases category central certificate chapter change changes check checklist choose class clean clear client close cloud code collection column command commands comment comments commit commits common community compare complete component components concept conclusion condition conditions config configuration configure connect connection consequently console constraints contact content contents context continue control copy core cost could count create created creating criteria critical current currently custom customer daily dashboard data database date day days debug decision default definition delete deploy deployment description design details developer development did difference directory disabled discussion display do docs document documentation does doing domain done down download draft driver during duration each edit editor effort either else email enable enabled encryption end engine engineer enough entry environment error errors even event events ever every example examples exit expected experience experiment explanation export extension external failure failures feature features feedback few field fields file files filter final finally find finding findings first fix fixed fixes flag flags flow focus folder follow following for format forward found framework free from full function functions furthermore further future general generate generated get gets getting give given global go goal goals goes going good got great group groups guide had handle handling has have having header health help hence her here hers high history him his hook hooks host hosts hour hours how however i idea ideas identity if image images impact implementation important improvement in include included includes including index info information initial input install installation instance instead instructions integration interface internal into is issue issues it item items its itself job jobs journal just keep key keys kind known label labels language large last latest later layer layout least less let level levels library like likely limit limitations limits line lines link links list load local location lock log logging login logs long loop low machine made main maintenance make makes manage manager manual many map mapping mark matrix may maybe me measure meanwhile member memory menu merge message messages method methods metric metrics might migration minimal minute minutes mode model models module modules monitor month months more moreover most move much must my name names native need needs network never nevertheless new next no node nodes none nor normal not note notes notice now number object objective objectives observation of off often on once one only open optional option options or order other others otherwise our out output over overall overview own owner package page pages parameter parameters parent part password path pattern patterns per performance permission permissions phase pipeline plan platform please plugin policy pool port position post practice prerequisites preview previous primary priority private problem process production profile progress project projects property protocol provider public purpose put query question questions queue quick range rate rather really reason recent recommendation record records recovery reference regression related release releases remote remove repeat replace report repository request requests required requirement requirements reset resource resources response restart restore result results retry review reviews right risk risks role roles root rule rules run runs runtime safety said same sample say scale schedule schema scope score script scripts search second section sections secret security see seem seems selection send sending sensitive server service services session sessions set setting settings setup several shall shared she should show shows signal similarly simple since site size skill skills slice slow small snapshot so software solution some something sometimes source sources space specific specification stable stack stage standard start started state statement static status step steps still storage store strategy stream string structure style subject success such summary support supported system systems table tables tag tags take takes target task tasks team template templates term terms test testing tests text than that the their them theme then there therefore these they thing things third this those though thread threshold through thus time timeline timeout title to today token tokens tomorrow too tool tools topic total track tracking traffic transfer trigger troubleshooting trust type types under unfortunately unit until up update updates upgrade upon us usage use used user users uses using usually validation value values variable variables vector version versions very view views volume want warning warnings was way we week weeks well were what when where whether which while who whom whose why will window windows with within without work worker workflow workflows workspace would write yes yesterday yet you your yours
mr mrs ms miss dr prof sir madam lord lady sr jr
english french german spanish chinese japanese hub
pros cons pro builder studio topics face comma fundamentals assisted guardrail inspector indeterminate reporters tabletop club cockpit foundry scheduler
corp corporation inc incorporated llc ltd limited gmbh company labs lab group holdings foundation institute university college school hospital bank association society council department ministry agency authority bureau office partners associates enterprises industries systems solutions technologies studios
noreply reply postmaster webmaster hostmaster abuse billing sales hello contact bot deploy
`);

// More ordinary and technical words, taken from the lowercase words that occur 12 or
// more times in this repository's own library and in the public model-eval corpus.
for (const w of words(`
abort absent absolute abstraction accent accept acceptable acceptance accepted accepts accessibility
accessible accounts act actionable activate activation activations activity actual adapter adapters adding
addresses adds administrative advisory aesthetic affected alerts alias aliases align alignment allowed
allowing allowlist alone alongside alternative ambiguous analyst analyze analyzer annotations appear appears
append applicable applied applies apply appropriate approval approve approved architectural arg argparse argv
art articles artifact artifacts artistic asks assert assertion assertions asserts assessment asset assignees
assistant assume ast async attach attached attempt audience auth authenticate authenticated authentication
authored auto automated automatically autonomy availability avoid await axe azdo back backed backend backlog
backpressure bad balance bar bare based baseline becomes behind better beyond big bin binary binding black
blank bleed blob blocked blockers blocking blocks boards bold book books bool border bottom boundaries
boundary bounded bounds box branches brand break breakdown breaks bridge broad broken budgets buf buffered
built bulk bundles bypass byte bytes cached caches caller callouts campaign canary candidate candidates
canonical cap capabilities capability capable capture captured card carries carry cascade cat catch categories
cause causes center changed changing channel character characters chart chat checked checking checkout
checkpoint checks child children choice chunk churn cite claim claims clarity cleaned cleanup cleared clearly
cli click clip clipboard closed cluster cmd cmyk codebase coder codes coding coherent collapse collision color
colors columns com come comes committed committing compact compacted compaction comparable comparison
compatibility compatible completed completely completion completions complex complexity compliance composition
comprehensive computed concern concise concrete concurrent conf confidence configs configurations configured
configuring confirm confirmation confirmed confirms conflict conflicts confusion connected connections
connector consecutive consent consistency consistent consolidate consolidation const constructor consumer
contain contained container containers containing contains contract contracts contradicted contrast controls
conventions conversation conversations conversion coordinator correct correctly costs counter counters counts
cover coverage covered covering covers creates creation credential credentials creds criterion cross ctrl ctx
curate curation customers customize cut cwd cycle cycles dark dashscope dat dead debt debugging decisions
declaration declared decline dedicated deep def defaults defect deferred define defined defines definitions
delegate delegation deleted deletion deliberately delivery demand density deny dependencies dependency
dependent depends deprecated depth derived descendant descendants describe descriptions designed designer
desktop destination destructive detail detailed detect detected detection detector deterministic dev
developers device devices devops diagnostic diagnostics diagrams dialog dict die diff different digest
dimension dimensions dir direct directly directories dirname dirty disable discovered discovery disk dispatch
dispatched dispatches dist distill distinct doc documented documents doesn dom don doom dotenv downstream
drain drift drive drop dry dtrpg due dumps duplicate duplication durable dynamic easy echo ecosystem edges
editing edits effect element elements elif eligible embed embedded embedding embeddings emit emits empty
encoding encrypted endpoint endpoints ensure ensures ensuring enter enterprise entire entirely entries
entrypoints env environments envs epics equivalent err escalated escalation escape established etc eval
evaluate evaluation evaluations evaluator everything evidence exact exactly exceeded exceeds excellent except
exclude excluded exec executable execute executed executing execution executor exist existing exists expect
experimental expert expired expires explain explicit explicitly exploration explorer exported exports expose
exposes extend extensions extract extraction eye facing fact facts fail failed failing fails fallback
fallbacks falls false families family fantasy fast faster fatal feel fetch filename filesystem fill filtering
fires five fixture fixtures flagged flight float floor flows focused followed font fonts forbidden force form
formats formatter formatters formatting forms four fresh front frontmatter frozen fully functionality game gap
gaps gate gated gates gateway gen generates generating generation generator generic gitignore glob globally
goto grade grammar graph gray green grid guarantees guard guardrails guidance guidelines guides gutter gws
haiku hand handler handles happens happy hard hardcode harness hash hashlib head headers heading headless
healthy heavy height helicone helper helpers heuristic heuristics hidden hierarchy higher highest hit hold
holds home hostname hot human icc idempotent identical identified identify idle ids ignore ignored img
immediate immediately implement implemented implementer implements import imported importlib imports improve
improvements incomplete increment indent independent independently indexed indexer individual inference init
inject injected injection ink inline inputs inside inspect installed int intake integer integrations integrity
intended intent intentional intentionally interact interaction interactive interactively interior internals
invalid inventory invocation invoke invoked isinstance isolated isolation iteration iterations join journaled
jsonc judge judges judgment keeps kept keyboard kill know knowledge lacks layers layouts leak lease leave left
legacy len length lesson lessons lib lifecycle lineage linked lint listed listen listing lists live lived
liveliness lives llm loaded loading loads localhost locally located locations locator locators lockfile
logfile logic logout longer look looks lookup loops lore lower maintain major making management managing
manifest manually mapped mappings maps margin margins marked marker markers marks master match matches
matching material matter max maximum meaning means measurable measured measurement measurements mechanics
mechanism media memories mergeable merged metadata mid migrate migrations milestone min mini minimum minor
mismatch missed missing mjs mkdir mock modal modals moderate moderation moderations modes modify monthly moved
multi multimodal multiple mutate mutation named namespace naming narrow natural navigation near necessary
needed nested neutral non nonactivation normalized normalizer nothing notification notifications notify npx
num numbered numbers numeric nvim observations observed offset okf old older omitted omni ones opens operation
operational operations operator ops opt opts opus orchestration orchestrator ordering ordinary org
organization organizations origin original orphans outcome outputs outside overflow override overrides owned
owners ownership owns pack packages packet padding pair panel panic paragraph parallel param params parents
parity parse parsed parser parses parsing partial parts party pass passed passes passing patch pathlib paths
paused payload payloads pct pdfx pending percentage persist personal phases pid pilot pipe pipefail pipelines
pixel place placed placeholder placement plain planner planning plans platforms plugins plus point points
polish poor portable portal positional positive possible posts potential practices pre prefer preferred prefix
preflight presence present preserve preserved preserving preset presets prevent preventing prevents principles
print printf printing prints prior probe problems proc procedure proceed processed processes processing
produce produced produces professional profiles promote promoted promotion prompt prompts proof proper
properties proposal proposals propose proposed prose protected provenance provide provided providers provides
proving proxy prs prune publication publish publishers publishing pull pure push qpdf quality queries queued
quickly quiet ragged raise ran ranking ratio rationale raw reach reachable read readability readable reader
readiness reading readonly reads ready real reasoning rebuild receives recognition recognize recommend
recommended recorded ref refactor refactoring referenced references reflect refresh refs refusal region
register registration registry regressions reject rejected rejects relative relayctl relevant rely relying
remain remaining remains removal removed rename renames render rendered renderer rendering renders repeatable
repeated replaced repo reported reporter reporting reports repos requested require requires requiring res
research resets resolution resolve resolved resolves responses rest resume retain retained retries return
returned returning returns reusable reuse revert reviewed reviewer reviewing rework rewrite rhythm rollback
round route router routes routing row rows rpm rubric runner running safe samples sandbox save saving scan
scenario scenarios scheduled scoped scopes scores scratch screen screenshot screenshots scroll sdk seam
searches secondary seconds secrets select selected selector selectors self semantic semantics sent sentence
sentences separate separated separately sequence serve servers sets severity sha shadow shape share sharing
shell shift ship shipped short shot showing shown sibling side sign signals signature significant signing
silent silently similar similarity simplification single sizes skip skipped skips slash sleep slug smaller
smallest snapshots social soft sonnet sort sorted spacing span spawn spawning spawns spec special specialized
specifically specificity specified specify specs speed spend split splitlines spot spread spreads src sst
stacks staging stale standalone standards starts startswith startup stash stat states stats stay stays stderr
stdin stdout stop stored stores stories story str strategies strict stringify strings strip stripped
structural structured styles stylesheet styling subagent subagents submission submissions submit subprocess
subsequent substitute subsystem succeeded successful successfully sufficient suggest suite summarize
superadmin supplied supports surface surfaces sweep switch symbol symbols symlink sync syntax synthesis sys
tab tail targeted targets technical telemetry temp temperature tempfile temporary ten testable tested themes
thorough three thresholds throughout throw tier tile timed timeouts timer timers times timestamp titles tmp
tooling top tpm trace tracked tracker treat tree triage triggers trim trimmed true truncated truth truthful
try tsx tui tuple turn turns two txt typographic typography unapproved unavailable uncertainty unchanged
understand undo unhealthy unique unittest unknown unless unlimited unnecessary unrelated unresolved unsafe
unsupported untracked unverified updated upload uri url useful usr util utilities utility valid validate
validator validators var variant variants vars verbatim verbose verdict verdicts verification verified verify
via viking violations visibility visible vision visual vlm vocabulary void wait waits walk warn watcher weaken
web webfetch website white whitespace whole wide widows width wiki wildcard wins won wordmark workers working
works worktree wrap wrapper wrappers wraps writable writer writes writing written wrong www xrefs yml yolo
yourself zero
`)) COMMON.add(w);

export const MONTHS_DAYS = words(`
january february march april may june july august september october november december
jan feb mar apr jun jul aug sep sept oct nov dec
monday tuesday wednesday thursday friday saturday sunday mon tue tues wed thu thur thurs fri sat sun
`);

export const TECH = words(`
python java javascript typescript rust go golang ruby php swift kotlin scala perl lua haskell elixir erlang clojure dart julia bash zsh fish powershell sql html css sass scss markdown yaml json jsonl toml xml csv tsv graphql protobuf latex csharp cpp objective fortran cobol assembly wasm webassembly solidity matlab
node nodejs bun deno npm pnpm yarn pip pipx uv poetry cargo gradle maven make cmake react vue angular svelte solid next nextjs nuxt remix astro vite webpack rollup esbuild babel eslint prettier biome jest vitest mocha pytest playwright puppeteer selenium cypress storybook tailwind bootstrap express fastify koa hono flask django fastapi rails laravel spring dotnet blazor flutter electron tauri expo numpy pandas scipy sklearn scikit tensorflow pytorch keras jax langchain llamaindex transformers huggingface zod pydantic sqlalchemy prisma drizzle typeorm sequelize mongoose axios lodash
docker dockerfile compose kubernetes helm terraform ansible puppet chef vagrant packer jenkins github gitlab bitbucket gitea forgejo circleci argo prometheus grafana loki jaeger opentelemetry datadog sentry nginx apache caddy traefik haproxy envoy istio cloudflare vercel netlify heroku fly railway aws azure gcp gcloud ec2 s3 lambda cloudfront dynamodb rds eks ecs fargate
postgres postgresql mysql mariadb sqlite redis memcached mongodb couchdb cassandra elasticsearch opensearch clickhouse influxdb timescaledb neo4j supabase firebase planetscale cockroachdb duckdb pgvector qdrant pinecone weaviate milvus chroma faiss lancedb kafka rabbitmq nats pulsar zookeeper
linux ubuntu debian fedora centos rhel arch alpine nixos macos windows android ios chromium chrome firefox safari edge wsl systemd cron crontab ssh ssl tls ntp dns dhcp tcp udp http https ftp smtp imap oauth saml jwt cuda rocm vulkan nvidia amd intel apple arm risc
google microsoft amazon meta openai anthropic claude gemini gemma llama mistral mixtral qwen deepseek kimi moonshot glm zhipu cohere perplexity groq cerebras together fireworks openrouter litellm ollama lmstudio llamacpp vllm sglang gpt chatgpt copilot codex cursor windsurf cline aider opencode goose zed vscode vim neovim emacs jetbrains intellij pycharm webstorm xcode obsidian notion figma slack discord telegram whatsapp signal matrix zoom teams jira confluence linear asana trello stripe paypal twilio sendgrid mailgun apprise ntfy pushover
akm gutterpress pagedjs paged playwright harbor longmemeval locomo beam skillret skillsbench terminal bench swe tau appworld agentskills mcp acp lsp
git grep sed awk curl wget jq yq ripgrep fzf tmux rsync tar gzip unzip chmod chown sudo apt brew yum dnf pacman snap flatpak ninja gcc clang llvm rustc
readme license licence changelog makefile dockerfile gemfile procfile unicode ascii utf pdf png jpeg jpg gif svg webp mp3 mp4 zip gz tgz iso
excel word powerpoint outlook onedrive sharepoint promise array map set object string number boolean null undefined
pillow swagger openapi ghostscript pantone adobe sap wayland webview kerberos grok
`);

export const FIRST = [
  "aaron", "abigail", "adam", "adrian", "aisha", "alan", "albert", "alejandra", "alex", "alexei", "alice", "alicia", "alina", "amara", "amelia", "amina", "amir", "ana", "anders", "andre", "andrea", "andrew", "angela", "anika", "anita", "anna", "anton", "arjun", "arthur", "asha", "astrid", "ava",
  "beatrice", "benjamin", "bianca", "bjorn", "bruno", "caleb", "camila", "carlos", "carmen", "caroline", "cecilia", "chen", "chloe", "christian", "clara", "claudia", "colin", "cora", "cristian", "dalia", "damian", "daniel", "dario", "david", "deborah", "delia", "diana", "diego", "dmitri", "dominic", "dora",
  "eduardo", "elena", "eli", "elias", "elise", "eliza", "emeka", "emilia", "emma", "enrique", "erik", "esther", "eva", "evelyn", "fabian", "farid", "felix", "fiona", "florian", "francis", "freya", "gabriel", "gemma", "george", "gianna", "giulia", "gustav", "hana", "hannah", "hans", "harper", "hassan", "hector", "helena", "henrik", "hugo",
  "ian", "ibrahim", "ida", "igor", "imani", "ingrid", "irene", "isaac", "isabel", "ivan", "jacob", "jamal", "jana", "jasmine", "javier", "jens", "joanna", "johan", "jonas", "jorge", "josef", "julia", "julian", "kai", "kamal", "karim", "karina", "katya", "keira", "kenji", "khalid", "kofi", "kristin",
  "lars", "laura", "leila", "lena", "leo", "leon", "lila", "lina", "liv", "lorenzo", "lucia", "lucas", "luis", "lukas", "lydia", "magnus", "malik", "manuel", "marco", "marek", "maria", "marina", "mario", "marta", "mateo", "matteo", "maya", "mei", "mia", "miguel", "mira", "mohamed", "monica",
  "nadia", "nadine", "naomi", "nia", "nico", "nikita", "nikolai", "nina", "noah", "noor", "olga", "oliver", "olivia", "omar", "oscar", "otto", "pablo", "paloma", "patrick", "paula", "pavel", "pedro", "petra", "philip", "piotr", "priya", "rafael", "rahul", "ramon", "raquel", "rhea", "ricardo", "rita", "robert", "rohan", "rosa", "ruben",
  "sabine", "sadia", "samir", "sanjay", "sara", "saoirse", "sebastian", "selma", "serena", "sergei", "sofia", "soren", "stefan", "stella", "sven", "tamara", "tariq", "tatiana", "teresa", "thomas", "tobias", "tomas", "ulrich", "uma", "valentina", "vera", "victor", "viktor", "vivian", "wanda", "wen", "wilhelm", "xavier", "yara", "yasmin", "yuki", "yusuf", "zara", "zoe",
];

export const SURNAMES = [
  "abbott", "adler", "alvarez", "andersson", "arnold", "bauer", "bellamy", "bennett", "bergstrom", "bianchi", "brandt", "castillo", "chaudhry", "cohen", "dalton", "dubois", "eriksen", "estrada", "fairchild", "fischer", "fontaine", "garrido", "gutierrez", "haddad", "hartley", "hoffmann", "ibarra", "iwasaki",
  "jansen", "jovanovic", "kaplan", "kowalski", "krause", "larsson", "lindqvist", "lopez", "maddox", "marchetti", "mendoza", "moreau", "nakamura", "nielsen", "novak", "okafor", "olsen", "ortega", "pemberton", "petrov", "quintero", "ramos", "rasmussen", "reyes", "romero", "rossi", "sandoval", "schmidt", "silva", "sokolov",
  "tanaka", "thorne", "underwood", "vargas", "vasquez", "volkov", "wagner", "whitfield", "yamamoto", "yilmaz", "zhang", "zielinski", "sharma", "patel", "nguyen", "kim", "singh", "khan", "ivanov", "costa", "santos", "ferrari", "weber", "lindgren", "ahmed", "okonkwo", "mwangi", "tran", "cruz",
];

// Labels that are never renamed inside a hostname. They describe a role, not an owner.
export const GENERIC_LABELS = words(`
www api app apps docs doc mail smtp imap pop ftp sftp git svn ci cd cdn static assets media img images files data db sql cache redis proxy gateway gw lb auth sso login admin portal dashboard console status metrics monitor logs grafana prom
dev test tests staging stage prod production qa uat demo preview beta alpha local localhost internal lan home example sandbox build builder runner agent worker node nodes master main primary replica web site blog shop store host server srv ns vpn mx relay
wiki help support chat registry repo repos artifacts intranet extranet lab labs
`);

// Registrable domains of well-known sites and services. A hostname under one of them
// is left alone, subdomains included (learn.microsoft.com, api.openai.com).
export const WELL_KNOWN_DOMAINS = words(`
github.com githubusercontent.com gitlab.com bitbucket.org npmjs.com npmjs.org pypi.org python.org rust-lang.org crates.io golang.org docker.com docker.io docker.internal ghcr.io quay.io
google.com googleapis.com gstatic.com gmail.com microsoft.com visualstudio.com azure.com windows.net amazonaws.com cloudflare.com openai.com anthropic.com claude.ai claude.com chatgpt.com huggingface.co arxiv.org
wikipedia.org wikimedia.org mozilla.org w3.org ietf.org iso.org creativecommons.org apache.org gnu.org kernel.org debian.org ubuntu.com fedoraproject.org archlinux.org nodejs.org bun.sh bun.com deno.land
vercel.com netlify.com stackoverflow.com stackexchange.com readthedocs.io readthedocs.org medium.com twitter.com x.com linkedin.com youtube.com reddit.com slack.com discord.com discord.gg telegram.org
notion.so figma.com sentry.io sentry.dev grafana.com prometheus.io kubernetes.io terraform.io hashicorp.com adobe.com aka.ms itch.io
opencode.ai opncd.ai opencode.cafe openrouter.ai ollama.com ollama.ai lmstudio.ai litellm.ai helicone.ai models.dev context7.com grep.app zed.dev zod.dev jetbrains.com color.org idealliance.org
json-schema.org jsonformatter.org yamllint.com prettier.io playwright.dev biomejs.dev llvm.org pagedjs.org ftaproject.dev agentskills.io agentclientprotocol.com ai-sdk.dev
drivethrurpg.com drivethrupartners.com unpkg.com ovh.com aliyun.com ondemand.com cursor.com appriseit.com
together.xyz together.ai zenmux.ai z.ai venice.ai nebius.com moonshot.ai minimax.io deepseek.com cerebras.ai deepinfra.com cortecs.ai fireworks.ai baseten.co io.net
`);

// Domains where anyone can claim a subdomain. The name in front is renamed; the domain is not.
export const USER_CONTENT_DOMAINS = words(`
github.io gitlab.io netlify.app vercel.app pages.dev herokuapp.com azurewebsites.net web.app firebaseapp.com workers.dev fly.dev onrender.com railway.app ngrok.io ngrok.app trycloudflare.com
`);

// Ports below 1024 are always kept too. These are the defaults of common datastores, brokers and local model servers.
export const KEEP_PORTS = new Set([1234, 1433, 1521, 2181, 2375, 2376, 3306, 5432, 5672, 6379, 9092, 9200, 11211, 11434, 27017]);
export const KEEP_IPS = new Set(["8.8.8.8", "8.8.4.4", "1.1.1.1", "1.0.0.1", "9.9.9.9", "172.17.0.1"]);
