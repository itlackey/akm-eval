---
description: Build and run Docker containers and compose stacks
---
# Docker

Use Docker to package services as images and run them as containers. Compose orchestrates multi-service stacks via a single `docker-compose.yml`. Pin image tags, declare healthchecks, and prefer named networks over the default bridge for anything beyond a single service.

## Render the merged compose config

`docker compose config` prints the compose model as Compose resolves it, without starting anything. Options that choose what to load go before the subcommand:

```sh
docker compose --env-file <file> -f <compose-file> -f <override-file> --profile <name> config
```

- `--env-file <file>` reads the variables from that file instead of `.env`.
- `-f <file>` loads a compose file. Repeat it to merge several; a later file overrides an earlier one.
- `--profile <name>` enables a profile, so the services in it are included.

Options of `config` itself go after it:

- `--services` prints only the service names.
- `--no-interpolate` leaves `${VAR}` references as written instead of substituting their values.

```sh
# example: the prod stack, with the prod variables and profile
docker compose --env-file envs/prod.env -f compose.yaml -f compose.prod.yaml --profile prod config
# example: only the service names
docker compose -f compose.yaml config --services
# example: the file with its variables left unexpanded
docker compose -f compose.yaml config --no-interpolate
```
