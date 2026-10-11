# Task: add healthcheck

Edit `service.yaml` so the inkwell service is health-checked. The probe must
request `/readyz`, run every 15 seconds, and change the service's state after 2
consecutive checks.
