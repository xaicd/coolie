import { describe, it, expect } from "vitest";
import { projectApiToMcpTool, synthesizeMockResponse } from "@paperclipai/ontology-core/api/lifecycle.js";

describe("Plugin Governance & Living Ontology Alignment", () => {
  it("projects community life contract to executable MCP tool with ontology bindings", () => {
    const houseRoomApi = {
      id: "api_com_001",
      companyId: "comp_default",
      projectId: "2288f08d-349d-46b0-abf4-5d4d7502f79a",
      name: "房源上架发布接口",
      apiKey: "house.room.create",
      protocol: "http" as const,
      endpoint: "/admin-api/house/room/create",
      httpMethod: "POST" as const,
      stage: "verified" as const,
      version: "v1.0.0",
      description: "房源资产录入与上架发布，强绑定 HouseRoom 活体本体与多租户隔离",
      requestSchema: [
        { name: "title", type: "string", required: true, description: "房源对外推广标题", ontologyEntityKey: "HouseRoom", ontologyPropertyKey: "title", example: "金星小区精装朝南两居室" },
        { name: "monthlyRent", type: "decimal", required: true, description: "月租金金额", ontologyEntityKey: "HouseRoom", ontologyPropertyKey: "monthly_rent", example: 3200.00 },
      ],
      responseSchema: [
        { name: "id", type: "string", required: true, description: "房源全局唯一 ID", ontologyEntityKey: "HouseRoom", ontologyPropertyKey: "id", example: "room_992104" },
        { name: "status", type: "string", required: true, description: "房源状态", ontologyEntityKey: "HouseRoom", ontologyPropertyKey: "status", example: "AVAILABLE" },
      ],
      errorContracts: [],
      mcpExposed: true,
      mcpToolName: "call_house_room_create",
      idempotent: true,
      tenantIsolated: true,
      createdAt: "2026-10-11T10:00:00Z",
      updatedAt: "2026-10-11T15:00:00Z",
    };

    const mcpTool = projectApiToMcpTool(houseRoomApi);
    expect(mcpTool).toBeDefined();
    expect(mcpTool?.name).toBe("call_house_room_create");
    expect(mcpTool?.description).toContain("房源资产录入与上架发布");
    expect(mcpTool?.parameters.properties.title).toBeDefined();
    expect(mcpTool?.parameters.properties.monthlyRent).toBeDefined();

    const mockRes = synthesizeMockResponse(houseRoomApi);
    expect(mockRes).toBeDefined();
    expect(mockRes.code).toBe(200);
    expect((mockRes.data as Record<string, unknown>).id).toBe("room_992104");
    expect((mockRes.data as Record<string, unknown>).status).toBe("AVAILABLE");
  });
});
