import type { ServerAdapterModule } from "@paperclipai/adapter-utils";
import { DSH_ADAPTER_TYPE, agentConfigurationDoc, models } from "../index.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { DeepSeekClient, DeepSeekRequestError } from "./deepseek.js";
export type {
  DeepSeekMessage,
  DeepSeekTool,
  DeepSeekToolCall,
  DeepSeekChatResponse,
  DshChatClient,
} from "./deepseek.js";
export {
  createMcpToolInvoker,
  ontologyMcpTools,
  projectApiMcpTools,
  dshCombinedTools,
} from "./mcp.js";
export { runDshHarness } from "./harness.js";

/**
 * dsh adapter — the DeepSeek Harness MCP gateway.
 *
 * A DeepSeek-hosted business agent that reaches the company through the
 * ontology MCP tool catalogue. Delivery is `invocation_context`: Paperclip
 * passes the run's context in, and the adapter carries the MCP conversation
 * itself rather than materializing tools into a workspace.
 */
export const dshAdapter: ServerAdapterModule = {
  type: DSH_ADAPTER_TYPE,
  runtimeToolDelivery: "invocation_context",
  execute,
  testEnvironment,
  models,
  supportsLocalAgentJwt: false,
  supportsInstructionsBundle: false,
  requiresMaterializedRuntimeSkills: false,
  agentConfigurationDoc,
};

export default dshAdapter;
