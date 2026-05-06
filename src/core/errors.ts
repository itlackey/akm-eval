export class AkmEvalError extends Error {
  constructor(message: string, public readonly code = 'AKM_EVAL_ERROR') {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigValidationError extends AkmEvalError {
  constructor(public readonly issues: string[]) {
    super(`Configuration validation failed:\n- ${issues.join('\n- ')}`, 'CONFIG_VALIDATION_ERROR');
  }
}

export class BoundaryViolationError extends AkmEvalError {
  constructor(message: string) {
    super(message, 'BOUNDARY_VIOLATION');
  }
}

export class UnknownPackError extends AkmEvalError {
  constructor(packId: string) {
    super(`Unknown pack: ${packId}`, 'UNKNOWN_PACK');
  }
}

export class UnknownVariantError extends AkmEvalError {
  constructor(variantId: string) {
    super(`Unknown variant: ${variantId}`, 'UNKNOWN_VARIANT');
  }
}

export class UnknownMemoryBackendError extends AkmEvalError {
  constructor(backendId: string) {
    super(`Unknown memory backend: ${backendId}`, 'UNKNOWN_MEMORY_BACKEND');
  }
}

export class MemoryBackendUnavailableError extends AkmEvalError {
  constructor(backendId: string, detail: string) {
    super(`Memory backend \"${backendId}\" is unavailable: ${detail}`, 'MEMORY_BACKEND_UNAVAILABLE');
  }
}

export class BenchmarkRuntimeError extends AkmEvalError {
  constructor(message: string) {
    super(message, 'BENCHMARK_RUNTIME_ERROR');
  }
}
