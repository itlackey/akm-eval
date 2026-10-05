/**
 * LiteLLM API Client
 * Comprehensive client for managing LiteLLM Proxy instances
 */

import type {
  LiteLLMClientConfig,
  LiteLLMError,
  ModelConfig,
  ModelAddRequest,
  ModelUpdateRequest,
  ModelDeleteRequest,
  ModelInfoResponse,
  ModelsListResponse,
  KeyGenerateRequest,
  KeyGenerateResponse,
  KeyUpdateRequest,
  KeyDeleteRequest,
  KeyInfoResponse,
  KeyRegenerateRequest,
  UserCreateRequest,
  UserCreateResponse,
  UserUpdateRequest,
  UserInfoResponse,
  UserDailyActivityRequest,
  UserDailyActivityResponse,
  TeamCreateRequest,
  TeamCreateResponse,
  TeamUpdateRequest,
  TeamInfoResponse,
  TeamMemberAddRequest,
  TeamMemberDeleteRequest,
  TeamMemberUpdateRequest,
  OrganizationCreateRequest,
  OrganizationResponse,
  BudgetCreateRequest,
  BudgetResponse,
  CustomerCreateRequest,
  CustomerResponse,
  HealthCheckResponse,
  ReadinessResponse,
  LivelinessResponse,
  SpendReportRequest,
  SpendReportResponse,
  SpendLogsRequest,
  SpendLog,
} from "./types.ts";

export class LiteLLMApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public param?: string
  ) {
    super(message);
    this.name = "LiteLLMApiError";
  }
}

export class LiteLLMClient {
  private apiBase: string;
  private masterKey: string;
  private apiKey: string;
  private maxRetries: number;
  private retryDelay: number;
  private timeout: number;

  public models: ModelManager;
  public keys: KeyManager;
  public users: UserManager;
  public teams: TeamManager;
  public organizations: OrganizationManager;
  public budgets: BudgetManager;
  public customers: CustomerManager;
  public health: HealthManager;
  public spend: SpendManager;
  public config: ConfigManager;

  constructor(options: LiteLLMClientConfig = {}) {
    this.apiBase = options.apiBase || process.env.LITELLM_API_BASE || "http://localhost:4000";
    this.masterKey = options.masterKey || process.env.LITELLM_MASTER_KEY || "";
    this.apiKey = options.apiKey || process.env.LITELLM_API_KEY || this.masterKey;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 1000;
    this.timeout = options.timeout ?? 30000;

    // Initialize managers
    this.models = new ModelManager(this);
    this.keys = new KeyManager(this);
    this.users = new UserManager(this);
    this.teams = new TeamManager(this);
    this.organizations = new OrganizationManager(this);
    this.budgets = new BudgetManager(this);
    this.customers = new CustomerManager(this);
    this.health = new HealthManager(this);
    this.spend = new SpendManager(this);
    this.config = new ConfigManager(this);
  }

  async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
      useMasterKey?: boolean;
    } = {}
  ): Promise<T> {
    const { body, params, useMasterKey = true } = options;
    const key = useMasterKey ? this.masterKey : this.apiKey;

    let url = `${this.apiBase}${path}`;
    
    // Add query parameters
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          searchParams.append(k, String(v));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (key) {
      headers["Authorization"] = `Bearer ${key}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || errorData.message || response.statusText;
          throw new LiteLLMApiError(
            errorMessage,
            response.status,
            errorData.error?.code,
            errorData.error?.param
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx)
        if (error instanceof LiteLLMApiError && error.status >= 400 && error.status < 500) {
          throw error;
        }

        // Retry on server errors (5xx) or network errors
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  // Convenience method for GET requests
  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  // Convenience method for POST requests
  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  // Convenience method for DELETE requests
  async delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body });
  }
}

// ============================================================================
// Model Manager
// ============================================================================

class ModelManager {
  constructor(private client: LiteLLMClient) {}

  /** Add a new model deployment */
  async add(config: ModelAddRequest): Promise<ModelInfoResponse> {
    return this.client.post("/model/new", config);
  }

  /** Update an existing model */
  async update(config: ModelUpdateRequest): Promise<ModelInfoResponse> {
    return this.client.post("/model/update", config);
  }

  /** Delete a model deployment */
  async delete(id: string): Promise<{ message: string }> {
    return this.client.post("/model/delete", { id });
  }

  /** List all available models */
  async list(): Promise<ModelsListResponse> {
    return this.client.get("/v1/models");
  }

  /** Get detailed model information */
  async info(modelId?: string): Promise<ModelInfoResponse | ModelInfoResponse[]> {
    const params = modelId ? { model_id: modelId } : undefined;
    return this.client.get("/v1/model/info", params);
  }

  /** Get model settings */
  async getSettings(): Promise<Record<string, unknown>> {
    return this.client.get("/model/settings");
  }

  /** Sync model pricing from GitHub */
  async syncPricing(): Promise<{ message: string }> {
    return this.client.post("/model/sync_pricing");
  }
}

// ============================================================================
// Key Manager
// ============================================================================

class KeyManager {
  constructor(private client: LiteLLMClient) {}

  /** Generate a new virtual key */
  async generate(config: KeyGenerateRequest = {}): Promise<KeyGenerateResponse> {
    return this.client.post("/key/generate", config);
  }

  /** Update an existing key */
  async update(config: KeyUpdateRequest): Promise<KeyInfoResponse> {
    return this.client.post("/key/update", config);
  }

  /** Delete/revoke keys */
  async delete(keys: string[]): Promise<{ deleted_keys: string[] }> {
    return this.client.post("/key/delete", { keys });
  }

  /** Get key information */
  async info(key: string): Promise<KeyInfoResponse> {
    return this.client.get("/key/info", { key });
  }

  /** Regenerate/rotate a key */
  async regenerate(key: string, config: KeyRegenerateRequest = {}): Promise<KeyGenerateResponse> {
    return this.client.post(`/key/${key}/regenerate`, config);
  }

  /** Check key health */
  async health(key?: string): Promise<{ status: string }> {
    return this.client.get("/key/health", key ? { key } : undefined);
  }

  /** List all keys */
  async list(params?: { 
    page?: number; 
    page_size?: number;
    team_id?: string;
    user_id?: string;
  }): Promise<{ keys: KeyInfoResponse[]; total: number }> {
    return this.client.get("/key/list", params);
  }
}

// ============================================================================
// User Manager
// ============================================================================

class UserManager {
  constructor(private client: LiteLLMClient) {}

  /** Create a new user */
  async create(config: UserCreateRequest): Promise<UserCreateResponse> {
    return this.client.post("/user/new", config);
  }

  /** Update an existing user */
  async update(config: UserUpdateRequest): Promise<UserInfoResponse> {
    return this.client.post("/user/update", config);
  }

  /** Delete a user */
  async delete(userIds: string[]): Promise<{ deleted_users: string[] }> {
    return this.client.post("/user/delete", { user_ids: userIds });
  }

  /** Get user information */
  async info(userId?: string): Promise<UserInfoResponse> {
    return this.client.get("/user/info", userId ? { user_id: userId } : undefined);
  }

  /** Get user's daily activity */
  async dailyActivity(params?: UserDailyActivityRequest): Promise<UserDailyActivityResponse> {
    return this.client.get("/user/daily/activity", params);
  }

  /** List all users */
  async list(params?: {
    page?: number;
    page_size?: number;
    role?: string;
  }): Promise<{ users: UserInfoResponse[]; total: number }> {
    return this.client.get("/user/list", params);
  }
}

// ============================================================================
// Team Manager
// ============================================================================

class TeamManager {
  constructor(private client: LiteLLMClient) {}

  /** Create a new team */
  async create(config: TeamCreateRequest): Promise<TeamCreateResponse> {
    return this.client.post("/team/new", config);
  }

  /** Update an existing team */
  async update(config: TeamUpdateRequest): Promise<TeamInfoResponse> {
    return this.client.post("/team/update", config);
  }

  /** Delete a team */
  async delete(teamIds: string[]): Promise<{ deleted_teams: string[] }> {
    return this.client.post("/team/delete", { team_ids: teamIds });
  }

  /** Get team information */
  async info(teamId: string): Promise<TeamInfoResponse> {
    return this.client.get("/team/info", { team_id: teamId });
  }

  /** List all teams */
  async list(params?: {
    page?: number;
    page_size?: number;
    organization_id?: string;
  }): Promise<TeamInfoResponse[]> {
    return this.client.get("/team/list", params);
  }

  /** Add a member to a team */
  async addMember(config: TeamMemberAddRequest): Promise<TeamInfoResponse> {
    return this.client.post("/team/member_add", config);
  }

  /** Remove a member from a team */
  async removeMember(config: TeamMemberDeleteRequest): Promise<TeamInfoResponse> {
    return this.client.post("/team/member_delete", config);
  }

  /** Update a team member's role */
  async updateMember(config: TeamMemberUpdateRequest): Promise<TeamInfoResponse> {
    return this.client.post("/team/member_update", config);
  }
}

// ============================================================================
// Organization Manager
// ============================================================================

class OrganizationManager {
  constructor(private client: LiteLLMClient) {}

  /** Create a new organization */
  async create(config: OrganizationCreateRequest): Promise<OrganizationResponse> {
    return this.client.post("/organization/new", config);
  }

  /** Update an organization */
  async update(config: { organization_id: string } & Partial<OrganizationCreateRequest>): Promise<OrganizationResponse> {
    return this.client.post("/organization/update", config);
  }

  /** Delete an organization */
  async delete(organizationIds: string[]): Promise<{ deleted_organizations: string[] }> {
    return this.client.post("/organization/delete", { organization_ids: organizationIds });
  }

  /** Get organization information */
  async info(organizationId: string): Promise<OrganizationResponse> {
    return this.client.get("/organization/info", { organization_id: organizationId });
  }

  /** List all organizations */
  async list(): Promise<OrganizationResponse[]> {
    return this.client.get("/organization/list");
  }
}

// ============================================================================
// Budget Manager
// ============================================================================

class BudgetManager {
  constructor(private client: LiteLLMClient) {}

  /** Create a new budget template */
  async create(config: BudgetCreateRequest): Promise<BudgetResponse> {
    return this.client.post("/budget/new", config);
  }

  /** Update a budget */
  async update(config: { budget_id: string } & Partial<BudgetCreateRequest>): Promise<BudgetResponse> {
    return this.client.post("/budget/update", config);
  }

  /** Delete a budget */
  async delete(budgetId: string): Promise<{ message: string }> {
    return this.client.post("/budget/delete", { budget_id: budgetId });
  }

  /** Get budget information */
  async info(budgetId: string): Promise<BudgetResponse> {
    return this.client.get("/budget/info", { budget_id: budgetId });
  }

  /** List all budgets */
  async list(): Promise<BudgetResponse[]> {
    return this.client.get("/budget/list");
  }
}

// ============================================================================
// Customer Manager
// ============================================================================

class CustomerManager {
  constructor(private client: LiteLLMClient) {}

  /** Create a new customer/end-user */
  async create(config: CustomerCreateRequest): Promise<CustomerResponse> {
    return this.client.post("/customer/new", config);
  }

  /** Update a customer */
  async update(config: CustomerCreateRequest): Promise<CustomerResponse> {
    return this.client.post("/customer/update", config);
  }

  /** Delete a customer */
  async delete(userIds: string[]): Promise<{ deleted_customers: string[] }> {
    return this.client.post("/customer/delete", { user_ids: userIds });
  }

  /** Get customer information */
  async info(endUserId: string): Promise<CustomerResponse> {
    return this.client.get("/customer/info", { end_user_id: endUserId });
  }

  /** List all customers */
  async list(params?: {
    page?: number;
    page_size?: number;
  }): Promise<CustomerResponse[]> {
    return this.client.get("/customer/list", params);
  }
}

// ============================================================================
// Health Manager
// ============================================================================

class HealthManager {
  constructor(private client: LiteLLMClient) {}

  /** Full health check (makes LLM API calls) */
  async check(model?: string): Promise<HealthCheckResponse> {
    return this.client.get("/health", model ? { model } : undefined);
  }

  /** Basic liveliness check */
  async liveliness(): Promise<LivelinessResponse> {
    return this.client.get("/health/liveliness");
  }

  /** Readiness check with DB status */
  async readiness(): Promise<ReadinessResponse> {
    return this.client.get("/health/readiness");
  }

  /** Check connected services */
  async services(): Promise<Record<string, { status: string }>> {
    return this.client.get("/health/services");
  }
}

// ============================================================================
// Spend Manager
// ============================================================================

class SpendManager {
  constructor(private client: LiteLLMClient) {}

  /** Get global spend report */
  async getReport(params?: SpendReportRequest): Promise<SpendReportResponse> {
    return this.client.get("/global/spend/report", params);
  }

  /** Reset all spend counters (master key only) */
  async reset(): Promise<{ message: string; status: string }> {
    return this.client.post("/global/spend/reset");
  }

  /** Get spend logs */
  async getLogs(params?: SpendLogsRequest): Promise<{ logs: SpendLog[]; total: number }> {
    return this.client.get("/global/spend/logs", params);
  }

  /** Get spend by keys */
  async byKeys(params?: { start_date?: string; end_date?: string }): Promise<Record<string, number>> {
    return this.client.get("/spend/keys", params);
  }

  /** Get spend by users */
  async byUsers(params?: { start_date?: string; end_date?: string }): Promise<Record<string, number>> {
    return this.client.get("/spend/users", params);
  }

  /** Get spend by teams */
  async byTeams(params?: { start_date?: string; end_date?: string }): Promise<Record<string, number>> {
    return this.client.get("/spend/teams", params);
  }

  /** Get spend by tags */
  async byTags(params?: { start_date?: string; end_date?: string }): Promise<Record<string, number>> {
    return this.client.get("/spend/tags", params);
  }
}

// ============================================================================
// Config Manager
// ============================================================================

class ConfigManager {
  constructor(private client: LiteLLMClient) {}

  /** Get current configuration */
  async get(): Promise<Record<string, unknown>> {
    return this.client.get("/config/yaml");
  }

  /** Update configuration */
  async update(config: Record<string, unknown>): Promise<{ message: string }> {
    return this.client.post("/config/update", config);
  }

  /** List configuration keys */
  async list(): Promise<string[]> {
    return this.client.get("/config/list");
  }

  /** Get field-specific configuration info */
  async fieldInfo(field: string): Promise<Record<string, unknown>> {
    return this.client.get("/config/field/info", { field });
  }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
LiteLLM Management Client

Usage:
  bun run client.ts <command> [options]

Commands:
  models:list              List all models
  models:info [id]         Get model info
  models:add <json>        Add a model (pass JSON config)
  models:delete <id>       Delete a model

  keys:list                List all keys
  keys:generate [json]     Generate a new key
  keys:info <key>          Get key info
  keys:delete <key>        Delete a key

  users:list               List all users
  users:info [id]          Get user info
  users:create <json>      Create a user

  teams:list               List all teams
  teams:info <id>          Get team info
  teams:create <json>      Create a team

  health                   Run full health check
  health:ready             Check readiness
  health:live              Check liveliness

  spend:report             Get spend report
  spend:logs               Get spend logs

Environment:
  LITELLM_API_BASE         LiteLLM proxy URL (default: http://localhost:4000)
  LITELLM_MASTER_KEY       Master key for admin operations
`);
    process.exit(0);
  }

  const client = new LiteLLMClient();
  const [command, ...rest] = args;

  try {
    switch (command) {
      // Model commands
      case "models:list": {
        const models = await client.models.list();
        console.log(JSON.stringify(models, null, 2));
        break;
      }
      case "models:info": {
        const info = await client.models.info(rest[0]);
        console.log(JSON.stringify(info, null, 2));
        break;
      }
      case "models:add": {
        const config = JSON.parse(rest[0]);
        const result = await client.models.add(config);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case "models:delete": {
        const result = await client.models.delete(rest[0]);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      // Key commands
      case "keys:list": {
        const keys = await client.keys.list();
        console.log(JSON.stringify(keys, null, 2));
        break;
      }
      case "keys:generate": {
        const config = rest[0] ? JSON.parse(rest[0]) : {};
        const result = await client.keys.generate(config);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
      case "keys:info": {
        const info = await client.keys.info(rest[0]);
        console.log(JSON.stringify(info, null, 2));
        break;
      }
      case "keys:delete": {
        const result = await client.keys.delete([rest[0]]);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      // User commands
      case "users:list": {
        const users = await client.users.list();
        console.log(JSON.stringify(users, null, 2));
        break;
      }
      case "users:info": {
        const info = await client.users.info(rest[0]);
        console.log(JSON.stringify(info, null, 2));
        break;
      }
      case "users:create": {
        const config = JSON.parse(rest[0]);
        const result = await client.users.create(config);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      // Team commands
      case "teams:list": {
        const teams = await client.teams.list();
        console.log(JSON.stringify(teams, null, 2));
        break;
      }
      case "teams:info": {
        const info = await client.teams.info(rest[0]);
        console.log(JSON.stringify(info, null, 2));
        break;
      }
      case "teams:create": {
        const config = JSON.parse(rest[0]);
        const result = await client.teams.create(config);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      // Health commands
      case "health": {
        const health = await client.health.check();
        console.log(JSON.stringify(health, null, 2));
        break;
      }
      case "health:ready": {
        const ready = await client.health.readiness();
        console.log(JSON.stringify(ready, null, 2));
        break;
      }
      case "health:live": {
        const live = await client.health.liveliness();
        console.log(JSON.stringify(live, null, 2));
        break;
      }

      // Spend commands
      case "spend:report": {
        const report = await client.spend.getReport();
        console.log(JSON.stringify(report, null, 2));
        break;
      }
      case "spend:logs": {
        const logs = await client.spend.getLogs();
        console.log(JSON.stringify(logs, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof LiteLLMApiError) {
      console.error(`API Error (${error.status}): ${error.message}`);
      if (error.code) console.error(`Code: ${error.code}`);
    } else {
      console.error("Error:", error);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main();
}
