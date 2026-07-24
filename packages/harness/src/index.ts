export type { Action } from "./action.js";
export {
  AgentLoop,
  type AgentLoopOptions,
  type RunResult,
  type RunStatus
} from "./agent-loop.js";
export { parseAction, type ActionParseResult } from "./action-parser.js";
export {
  ApprovalGate,
  type ApprovalErrorCode,
  type ApprovalHandler,
  type ApprovalRequest,
  type ApprovalResult
} from "./approval.js";
export {
  CommandTool,
  type CommandOutput,
  type CommandToolErrorCode,
  type CommandToolOptions,
  type CommandToolResult
} from "./command-tool.js";
export type { CommandRule } from "./command-rule.js";
export {
  formatApprovalRequest,
  runCli,
  type CliDependencies
} from "./cli.js";
export {
  CredentialStore,
  type CredentialErrorCode,
  type CredentialResult,
  type CredentialStoreBoundary,
  type CredentialStoreFactory,
  type CredentialStoreFileSystem,
  type CredentialStoreOptions,
  type CredentialStatus
} from "./credential-store.js";
export {
  parseHarnessConfig,
  type ConfigErrorCode,
  type ConfigParseResult,
  type HarnessConfig
} from "./config.js";
export {
  Dispatcher,
  type DispatcherOptions,
  type DispatchResult
} from "./dispatcher.js";
export {
  classifyFeedback,
  type FeedbackCategory,
  type FeedbackResult
} from "./feedback.js";
export {
  FileTools,
  type FileToolErrorCode,
  type FileToolResult
} from "./file-tools.js";
export {
  initializeFirstRun,
  validateFirstRunInput,
  type FirstRunDependencies,
  type FirstRunField,
  type FirstRunInput,
  type FirstRunInputValidator,
  type FirstRunOptions,
  type FirstRunResult,
  type FirstRunValidationResult,
  type SystemCredentialVaultFactory
} from "./first-run.js";
export type { LLMInput, LLMOutput, LLMProvider } from "./llm-provider.js";
export { runOfflineSmoke } from "./offline-smoke.js";
export {
  OpenAICompatibleProvider,
  OpenAICompatibleProviderError,
  validProviderBaseUrl,
  type OpenAICompatibleProviderErrorCode,
  type OpenAICompatibleProviderOptions
} from "./openai-compatible-provider.js";
export {
  JsonMemory,
  type MemoryErrorCode,
  type MemoryItem,
  type MemoryKind,
  type MemoryResult,
  type MemorySearchQuery
} from "./json-memory.js";
export {
  PathGuard,
  type PathAccess,
  type PathGuardErrorCode,
  type PathGuardResult
} from "./path-guard.js";
export {
  PolicyEngine,
  type PolicyDecision,
  type PolicyEngineOptions
} from "./policy.js";
export { Redactor } from "./redactor.js";
export {
  preflightHarnessTaskConfig,
  readHarnessTaskConfig,
  runHarnessTask,
  type RunHarnessTaskOptions,
  type RunTaskConfigPreflightResult,
  type RunTaskErrorCode,
  type RunTaskResult
} from "./run-task.js";
export { ScriptedMockExhaustedError, ScriptedMockLLM } from "./scripted-mock-llm.js";
export {
  WindowsUserCredentialVault,
  runWindowsCredentialProtectionProcess,
  type CredentialProtectionProcess,
  type CredentialProtectionProcessRequest,
  type CredentialProtectionProcessResult,
  type SystemCredentialErrorCode,
  type SystemCredentialResult,
  type SystemCredentialVault,
  type SystemCredentialVaultFileSystem,
  type WindowsUserCredentialVaultOptions
} from "./system-credential-vault.js";
export {
  runInteractiveSession,
  type InteractiveSessionDependencies,
  type InteractiveSessionOptions
} from "./interactive-session.js";
export {
  JsonTrace,
  type TraceEntry,
  type TraceErrorCode,
  type TraceResult,
  type TraceStatus
} from "./trace.js";
