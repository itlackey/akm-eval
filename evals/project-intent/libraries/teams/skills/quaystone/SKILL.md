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

## scale

Set how many replicas of a service run.

```sh
quaystone scale <service> --replicas <n>
```

## alert

Send a service's alerts to a chat channel.

```sh
quaystone alert <service> --route <channel>
```

## backup

Set the daily time (UTC, `HH:MM`) a service's data is backed up.

```sh
quaystone backup <service> --window <HH:MM>
```

## tag

Set the prefix of a service's release tags.

```sh
quaystone tag <service> --prefix <prefix>
```

## region

Pin a service to a region.

```sh
quaystone region <service> --set <region>
```

## drain

Take a service out of its pool, waiting a grace period (seconds) for open requests.

```sh
quaystone drain <service> --grace <seconds>
```

## rewind

Roll a service back to an earlier release. Release ids look like `r482`.

```sh
quaystone rewind <service> --to <release> --hold <minutes>
```

`--hold` keeps the pool from taking new ships for that many minutes.
