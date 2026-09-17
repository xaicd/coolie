/**
 * The gRPC / protobuf pass — a source shape the plugin previously could not
 * read at all, even though a `.proto` already declares the object model, the
 * vocabulary and the operations in one typed file.
 */
import { describe, expect, it } from "vitest";
import {
  parseProtoFile,
  protoTypeToSchemaType,
  serviceFromProtoPackage,
} from "@paperclipai/ontology-core/cognition/protoParser.js";
import { extractRepoDraft, parseSourceFile } from "@paperclipai/ontology-core/cognition/AstExtractor.js";

const ORDER_PROTO = `
syntax = "proto3";

package ecommerce.order.v1;

import "google/protobuf/timestamp.proto";

// 订单
message Order {
  string order_id = 1;              // 订单号
  int64 total_cents = 2;
  bool paid = 3;
  repeated OrderItem items = 4;
  google.protobuf.Timestamp created_at = 5;

  message Meta {
    string k = 1;
    string v = 2;
  }

  oneof payment {
    string card_id = 6;
    string wallet_id = 7;
  }
}

message OrderItem {
  string sku = 1;
  int32 qty = 2;
}

// 订单状态
enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_PAID = 1;
}

service OrderService {
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc ListOrders(ListOrdersRequest) returns (stream Order);
}
`;

describe("parseProtoFile — messages", () => {
  const result = parseProtoFile(ORDER_PROTO, "order.proto");
  const order = result.entities.find((e) => e.typeName === "Order")!;

  it("reads the package as the service boundary", () => {
    expect(order.origin).toMatchObject({
      kind: "proto",
      namespace: "ecommerce.order.v1",
      service: "order",
      stereotype: "message",
    });
  });

  it("takes the doc comment above the message as its description", () => {
    expect(order.description).toBe("订单");
  });

  it("extracts every field with a schema type", () => {
    const types = Object.fromEntries(order.properties!.map((p) => [p.name, p.type]));
    expect(types.order_id).toBe("string");
    expect(types.total_cents).toBe("number");
    expect(types.paid).toBe("boolean");
    expect(types.items).toBe("array");
    expect(types.created_at).toBe("string");
  });

  it("keeps oneof members — they are real fields", () => {
    const names = order.properties!.map((p) => p.name);
    expect(names).toContain("card_id");
    expect(names).toContain("wallet_id");
  });

  it("does not read a nested message's fields as its own", () => {
    const names = order.properties!.map((p) => p.name);
    expect(names).not.toContain("k");
    expect(names).not.toContain("v");
    // …but the nested type still exists in its own right.
    expect(result.entities.map((e) => e.typeName)).toContain("Meta");
  });

  it("remembers the declared message type so relations can be derived", () => {
    expect(order.properties!.find((p) => p.name === "items")!.declaredType).toBe("OrderItem");
  });

  it("captures the field tag, which is the wire contract", () => {
    expect(order.properties!.find((p) => p.name === "order_id")!.description).toBe("字段 #1");
  });
});

describe("parseProtoFile — enums", () => {
  it("records the vocabulary as the type's values", () => {
    const status = parseProtoFile(ORDER_PROTO, "order.proto").entities.find(
      (e) => e.typeName === "OrderStatus",
    )!;
    expect(status.origin?.stereotype).toBe("enum");
    expect(status.description).toBe("订单状态");
    expect(status.properties![0]!.description).toBe("ORDER_STATUS_UNSPECIFIED / ORDER_STATUS_PAID");
  });
});

describe("parseProtoFile — services", () => {
  const actions = parseProtoFile(ORDER_PROTO, "order.proto").actions;

  it("names each rpc by its canonical gRPC path", () => {
    expect(actions.map((a) => a.routePath)).toEqual([
      "/ecommerce.order.v1.OrderService/GetOrder",
      "/ecommerce.order.v1.OrderService/ListOrders",
    ]);
  });

  it("points the action at its response message", () => {
    expect(actions.map((a) => a.targetEntity)).toEqual(["Order", "Order"]);
  });

  it("handles a streamed response", () => {
    expect(actions[1]!.routePath).toContain("ListOrders");
  });
});

describe("protoTypeToSchemaType", () => {
  it.each([
    ["string", "string"],
    ["int32", "number"],
    ["int64", "number"],
    ["double", "number"],
    ["bool", "boolean"],
    ["bytes", "string"],
    ["OrderItem", "string"],
  ])("%s → %s", (protoType, expected) => {
    expect(protoTypeToSchemaType(protoType)).toBe(expected);
  });
});

describe("serviceFromProtoPackage", () => {
  it.each([
    ["ecommerce.order.v1", "order"],
    ["com.acme.payments.api", "payments"],
    ["acme.shipping", "shipping"],
    ["v1", undefined],
  ])("%s → %s", (pkg, expected) => {
    expect(serviceFromProtoPackage(pkg)).toBe(expected);
  });
});

describe("proto through the shared pipeline", () => {
  it("is reachable through parseSourceFile", () => {
    const dispatched = parseSourceFile("order.proto", ORDER_PROTO);
    expect(dispatched.entities.map((e) => e.typeName)).toContain("Order");
  });

  it("turns a message-typed field into a relation in the folded draft", () => {
    const draft = extractRepoDraft([{ path: "order.proto", content: ORDER_PROTO }]);
    const order = draft.seedNodeTypes.find((n) => n.typeName === "Order")!;
    expect(order.origin).toMatchObject({ kind: "proto", service: "order" });
    // Order.items is `repeated OrderItem`, and OrderItem is in the same scan.
    expect(draft.seedRelationTypes.some((r) => r.displayName === "Order references OrderItem")).toBe(true);
    expect(draft.seedActions).toHaveLength(2);
  });

  it("does not invent relations for scalar fields", () => {
    const draft = extractRepoDraft([
      { path: "a.proto", content: 'package x.y;\nmessage A { string name = 1; int64 n = 2; }' },
    ]);
    expect(draft.coverage.relationCount).toBe(0);
  });
});
