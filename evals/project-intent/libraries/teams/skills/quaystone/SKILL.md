---
description: Ship, probe, retain and roll back services with the quaystone command-line tool
tags: [quaystone, deploy, cli]
---
# quaystone

Command-line tool that ships services to deployment pools and manages them there.

```
quaystone <command> <service> [flags]
```

## ship

Deploy a service to a pool.

```sh
quaystone ship <service> --pool <pool>
```

## probe

Check a service's health endpoint on a port.

```sh
quaystone probe <service> --port <port>
```

## retain

Set how many days a service's logs are kept.

```sh
quaystone retain <service> --days <n>
```

## rewind

Roll a service back to an earlier release. Release ids look like `r482`.

```sh
quaystone rewind <service> --to <release> --hold <minutes>
```

`--hold` keeps the pool from taking new ships for that many minutes.
