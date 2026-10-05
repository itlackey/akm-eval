/**
 * LiteLLM API Type Definitions
 * Comprehensive types for all LiteLLM Proxy API endpoints
 */

// ============================================================================
// Common Types
// ============================================================================

export interface LiteLLMClientConfig {
  apiBase?: string;
  masterKey?: string;
  apiKey?: string;
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class LiteLLMError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public param?: string
  ) {
    super(message);
    this.name = "LiteLLMError";
  }
}

// ============================================================================
// Model Types
// ============================================================================

export interface LiteLLMParams {
  model: string;
  api_key?: string;
  api_base?: string;
  api_version?: string;
  rpm?: number;
  tpm?: number;
  timeout?: number;
  stream_timeout?: number;
  max_retries?: number;
  organization?: string;
  custom_llm_provider?: string;
  // Azure-specific
  azure_ad_token?: string;
  // AWS Bedrock-specific
  aws_region_name?: string;
  aws_access_key_id?: string;
  aws_secret_access_key?: string;
  // Vertex AI-specific
  vertex_project?: string;
  vertex_location?: string;
  // Additional params
  [key: string]: unknown;
}

export interface ModelInfo {
  id?: string;
  description?: string;
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  mode?: "chat" | "embedding" | "image_generation" | "audio" | "batch" | "realtime" | "ocr";
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_parallel_function_calling?: boolean;
  health_check_timeout?: number;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ModelConfig {
  model_name: string;
  litellm_params: LiteLLMParams;
  model_info?: ModelInfo;
}

export interface ModelAddRequest extends ModelConfig {}

export interface ModelUpdateRequest {
  model_id: string;
  model_name?: string;
  litellm_params?: Partial<LiteLLMParams>;
  model_info?: Partial<ModelInfo>;
}

export interface ModelDeleteRequest {
  id: string;
}

export interface ModelInfoResponse {
  id: string;
  model_name: string;
  litellm_params: LiteLLMParams;
  model_info: ModelInfo;
  created_at?: string;
  updated_at?: string;
}

export interface ModelsListResponse {
  object: "list";
  data: Array<{
    id: string;
    object: "model";
    created: number;
    owned_by: string;
  }>;
}

// ============================================================================
// Key Types
// ============================================================================

export interface KeyGenerateRequest {
  key_alias?: string;
  duration?: string;
  models?: string[];
  aliases?: Record<string, string>;
  config?: Record<string, unknown>;
  spend?: number;
  max_budget?: number;
  budget_duration?: string;
  user_id?: string;
  team_id?: string;
  max_parallel_requests?: number;
  metadata?: Record<string, unknown>;
  tpm_limit?: number;
  rpm_limit?: number;
  budget_id?: string;
  soft_budget?: number;
  allowed_cache_controls?: string[];
  permissions?: Record<string, boolean>;
  model_max_budget?: Record<string, number>;
  model_rpm_limit?: Record<string, number>;
  model_tpm_limit?: Record<string, number>;
  guardrails?: string[];
  blocked?: boolean;
  tags?: string[];
  org_id?: string;
  key_type?: "llm_api" | "management" | "admin";
  send_invite_email?: boolean;
  auto_rotate?: boolean;
  rotation_interval?: string;
}

export interface KeyGenerateResponse {
  key: string;
  key_name: string;
  token: string;
  expires: string | null;
  user_id: string;
  team_id: string | null;
  max_budget: number | null;
  spend: number;
  models: string[];
  aliases: Record<string, string>;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface KeyUpdateRequest {
  key: string;
  key_alias?: string;
  models?: string[];
  spend?: number;
  max_budget?: number;
  budget_duration?: string;
  max_parallel_requests?: number;
  metadata?: Record<string, unknown>;
  tpm_limit?: number;
  rpm_limit?: number;
  permissions?: Record<string, boolean>;
  model_max_budget?: Record<string, number>;
  guardrails?: string[];
  blocked?: boolean;
  temp_budget_increase?: number;
  temp_budget_expiry?: string;
}

export interface KeyDeleteRequest {
  keys: string[];
}

export interface KeyInfoResponse {
  token: string;
  key_name: string;
  key_alias: string | null;
  spend: number;
  max_budget: number | null;
  expires: string | null;
  models: string[];
  aliases: Record<string, string>;
  config: Record<string, unknown>;
  user_id: string;
  team_id: string | null;
  permissions: Record<string, boolean>;
  max_parallel_requests: number | null;
  metadata: Record<string, unknown>;
  tpm_limit: number | null;
  rpm_limit: number | null;
  budget_duration: string | null;
  budget_reset_at: string | null;
  blocked: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface KeyRegenerateRequest {
  key?: string;
  duration?: string;
  models?: string[];
  max_budget?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// User Types
// ============================================================================

export interface UserCreateRequest {
  user_id?: string;
  user_email?: string;
  user_role?: "proxy_admin" | "proxy_admin_view_only" | "internal_user" | "internal_user_view_only";
  max_budget?: number;
  budget_duration?: string;
  models?: string[];
  team_id?: string;
  organization_id?: string;
  metadata?: Record<string, unknown>;
  tpm_limit?: number;
  rpm_limit?: number;
  auto_create_key?: boolean;
  key_alias?: string;
  allowed_model_region?: string;
}

export interface UserCreateResponse {
  user_id: string;
  user_email: string | null;
  user_role: string;
  max_budget: number | null;
  spend: number;
  models: string[];
  team_id: string | null;
  metadata: Record<string, unknown>;
  key?: string;
}

export interface UserUpdateRequest {
  user_id: string;
  user_email?: string;
  user_role?: string;
  max_budget?: number;
  budget_duration?: string;
  models?: string[];
  metadata?: Record<string, unknown>;
  tpm_limit?: number;
  rpm_limit?: number;
  blocked?: boolean;
}

export interface UserInfoResponse {
  user_id: string;
  user_email: string | null;
  user_role: string;
  max_budget: number | null;
  spend: number;
  models: string[];
  team_id: string | null;
  organization_id: string | null;
  metadata: Record<string, unknown>;
  tpm_limit: number | null;
  rpm_limit: number | null;
  budget_duration: string | null;
  budget_reset_at: string | null;
  created_at: string;
  updated_at: string;
  keys: KeyInfoResponse[];
}

export interface UserDailyActivityRequest {
  start_date?: string;
  end_date?: string;
}

export interface UserDailyActivityResponse {
  results: Array<{
    date: string;
    metrics: {
      spend: number;
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      api_requests: number;
    };
    breakdown: {
      models: Record<string, {
        spend: number;
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        api_requests: number;
      }>;
      providers: Record<string, unknown>;
      api_keys: Record<string, unknown>;
    };
  }>;
  metadata: {
    total_spend: number;
    total_prompt_tokens: number;
    total_completion_tokens: number;
    total_api_requests: number;
  };
}

// ============================================================================
// Team Types
// ============================================================================

export interface TeamCreateRequest {
  team_alias: string;
  team_id?: string;
  models?: string[];
  max_budget?: number;
  budget_duration?: string;
  metadata?: Record<string, unknown>;
  tpm_limit?: number;
  rpm_limit?: number;
  members_with_roles?: Array<{
    user_id?: string;
    user_email?: string;
    role: "admin" | "user";
  }>;
  blocked?: boolean;
  organization_id?: string;
  tags?: string[];
}

export interface TeamCreateResponse {
  team_id: string;
  team_alias: string;
  max_budget: number | null;
  spend: number;
  models: string[];
  metadata: Record<string, unknown>;
  tpm_limit: number | null;
  rpm_limit: number | null;
  budget_duration: string | null;
  budget_reset_at: string | null;
  created_at: string;
}

export interface TeamUpdateRequest {
  team_id: string;
  team_alias?: string;
  models?: string[];
  max_budget?: number;
  budget_duration?: string;
  metadata?: Record<string, unknown>;
  tpm_limit?: number;
  rpm_limit?: number;
  blocked?: boolean;
}

export interface TeamInfoResponse {
  team_id: string;
  team_alias: string;
  max_budget: number | null;
  spend: number;
  models: string[];
  metadata: Record<string, unknown>;
  tpm_limit: number | null;
  rpm_limit: number | null;
  budget_duration: string | null;
  budget_reset_at: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
  members: TeamMember[];
  keys: KeyInfoResponse[];
}

export interface TeamMember {
  user_id: string;
  user_email: string | null;
  role: "admin" | "user";
  spend: number;
  max_budget: number | null;
}

export interface TeamMemberAddRequest {
  team_id: string;
  member: {
    user_id?: string;
    user_email?: string;
    role?: "admin" | "user";
  };
}

export interface TeamMemberDeleteRequest {
  team_id: string;
  user_id?: string;
  user_email?: string;
}

export interface TeamMemberUpdateRequest {
  team_id: string;
  user_id: string;
  role: "admin" | "user";
  max_budget?: number;
}

// ============================================================================
// Organization Types
// ============================================================================

export interface OrganizationCreateRequest {
  organization_alias: string;
  organization_id?: string;
  max_budget?: number;
  budget_duration?: string;
  models?: string[];
  metadata?: Record<string, unknown>;
}

export interface OrganizationResponse {
  organization_id: string;
  organization_alias: string;
  max_budget: number | null;
  spend: number;
  models: string[];
  metadata: Record<string, unknown>;
  budget_duration: string | null;
  budget_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Budget Types
// ============================================================================

export interface BudgetCreateRequest {
  budget_id?: string;
  max_budget?: number;
  soft_budget?: number;
  budget_duration?: string;
  tpm_limit?: number;
  rpm_limit?: number;
  max_parallel_requests?: number;
  model_max_budget?: Record<string, number>;
}

export interface BudgetResponse {
  budget_id: string;
  max_budget: number | null;
  soft_budget: number | null;
  budget_duration: string | null;
  tpm_limit: number | null;
  rpm_limit: number | null;
  max_parallel_requests: number | null;
  model_max_budget: Record<string, number>;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Customer Types
// ============================================================================

export interface CustomerCreateRequest {
  user_id: string;
  alias?: string;
  budget_id?: string;
  max_budget?: number;
  budget_duration?: string;
  allowed_model_region?: string;
  default_model?: string;
  blocked?: boolean;
}

export interface CustomerResponse {
  user_id: string;
  alias: string | null;
  blocked: boolean;
  spend: number;
  max_budget: number | null;
  allowed_model_region: string | null;
  default_model: string | null;
  budget_id: string | null;
}

// ============================================================================
// Health Types
// ============================================================================

export interface HealthCheckResponse {
  healthy_endpoints: Array<{
    model: string;
    api_base?: string;
    "x-ms-region"?: string;
  }>;
  unhealthy_endpoints: Array<{
    model: string;
    api_base?: string;
    error?: string;
  }>;
  healthy_count: number;
  unhealthy_count: number;
}

export interface ReadinessResponse {
  status: "connected" | "disconnected";
  db: "connected" | "disconnected";
  cache: string | null;
  litellm_version: string;
  success_callbacks: string[];
  failure_callbacks: string[];
}

export interface LivelinessResponse {
  status: "healthy";
}

// ============================================================================
// Spend Types
// ============================================================================

export interface SpendReportRequest {
  start_date?: string;
  end_date?: string;
  group_by?: "team" | "key" | "user" | "customer" | "model" | "tag";
}

export interface SpendReportResponse {
  spend: number;
  max_budget: number | null;
  budget_duration: string | null;
  budget_reset_at: string | null;
  breakdown?: Array<{
    group: string;
    spend: number;
    tokens: number;
    requests: number;
  }>;
}

export interface SpendLogsRequest {
  start_date?: string;
  end_date?: string;
  api_key?: string;
  user_id?: string;
  team_id?: string;
  request_id?: string;
  page?: number;
  page_size?: number;
}

export interface SpendLog {
  request_id: string;
  api_key: string;
  user: string;
  team_id: string | null;
  end_user: string | null;
  model_group: string;
  model: string;
  api_base: string;
  spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  request_tags: string[];
  startTime: string;
  endTime: string;
  completionStartTime: string | null;
  status: "success" | "failure";
  cache_hit: "True" | "False";
}

// ============================================================================
// Config Types
// ============================================================================

export interface GeneralSettings {
  master_key?: string;
  database_url?: string;
  database_connection_pool_limit?: number;
  database_connection_timeout?: number;
  alerting?: string[];
  alerting_threshold?: number;
  background_health_checks?: boolean;
  health_check_interval?: number;
  max_parallel_requests?: number;
  global_max_parallel_requests?: number;
  allowed_routes?: string[];
  enable_jwt_auth?: boolean;
  enforce_user_param?: boolean;
  disable_spend_logs?: boolean;
  store_prompts_in_spend_logs?: boolean;
  [key: string]: unknown;
}

export interface LiteLLMSettings {
  drop_params?: boolean;
  num_retries?: number;
  request_timeout?: number;
  fallbacks?: Array<Record<string, string[]>>;
  context_window_fallbacks?: Array<Record<string, string[]>>;
  allowed_fails?: number;
  cooldown_time?: number;
  max_budget?: number;
  budget_duration?: string;
  cache?: boolean;
  cache_params?: {
    type: "redis" | "local" | "s3" | "disk";
    host?: string;
    port?: number;
    password?: string;
    namespace?: string;
    ttl?: number;
  };
  success_callback?: string[];
  failure_callback?: string[];
  [key: string]: unknown;
}

export interface RouterSettings {
  routing_strategy?: "simple-shuffle" | "least-busy" | "usage-based-routing" | "latency-based-routing";
  redis_host?: string;
  redis_port?: number;
  redis_password?: string;
  enable_pre_call_checks?: boolean;
  num_retries?: number;
  timeout?: number;
  retry_policy?: Record<string, number>;
  allowed_fails_policy?: Record<string, number>;
  [key: string]: unknown;
}

export interface LiteLLMConfig {
  model_list: ModelConfig[];
  general_settings?: GeneralSettings;
  litellm_settings?: LiteLLMSettings;
  router_settings?: RouterSettings;
  environment_variables?: Record<string, string>;
}

// ============================================================================
// Callback/Webhook Types
// ============================================================================

export interface CallbackSettings {
  type: string;
  params?: Record<string, unknown>;
}

// ============================================================================
// Error Log Types
// ============================================================================

export interface ErrorLog {
  id: string;
  request_id: string;
  model_group: string;
  model_id: string;
  api_base: string;
  exception_type: string;
  exception_message: string;
  status_code: number | null;
  startTime: string;
  endTime: string;
}

export interface ErrorLogsRequest {
  start_date?: string;
  end_date?: string;
  model_group?: string;
  api_key?: string;
  page?: number;
  page_size?: number;
}

// ============================================================================
// Pass-Through Endpoint Types
// ============================================================================

export interface PassThroughEndpoint {
  path: string;
  target: string;
  auth?: boolean;
  forward_headers?: boolean;
  headers?: Record<string, string>;
}

// ============================================================================
// Guardrail Types
// ============================================================================

export interface GuardrailConfig {
  guardrail_name: string;
  mode: "during_call" | "pre_call" | "post_call";
  default_on?: boolean;
  callbacks?: string[];
  guardrail_params?: Record<string, unknown>;
}
