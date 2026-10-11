Your working directory is `/app`. It contains `service.yaml`, an existing
inkwell service definition.

Edit `service.yaml` so the service is health-checked. The probe must request
`/readyz`, run every 15 seconds, and change the service's state after 2
consecutive checks.

Save the result back to `service.yaml`.
