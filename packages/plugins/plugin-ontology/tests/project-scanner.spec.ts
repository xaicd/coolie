/**
 * Project-directory scanning.
 *
 * Each fixture is a shape the plugin has to read in the field: a RuoYi-Pro
 * multi-module Maven build, a Spring Cloud microservice layout that names itself
 * in `application.yml`, and a gRPC contract repo. The point of the scanner is
 * that none of them look like a JavaScript project, which is all the previous
 * directory picker could read.
 */
import { describe, expect, it } from "vitest";
import { parseSpringAppName, readSpringAppName } from "@paperclipai/ontology-core/architecture/serviceDetector.js";
import { scanProject } from "@paperclipai/ontology-core/cognition/projectScanner.js";
import { MAX_FILES } from "@paperclipai/ontology-core/architecture/index.js";
import type { SourceFile } from "@paperclipai/ontology-core/cognition/AstExtractor.js";

const POM = `<project><artifactId>mod</artifactId></project>`;

const SYS_DEPT = `
package com.ruoyi.system.domain;

@Entity
@Table(name = "sys_dept")
public class SysDept {
    @Id
    private Long deptId;

    @Column(name = "dept_name")
    private String deptName;
}
`;

const SYS_USER = `
package com.ruoyi.system.domain;

@Entity
@Table(name = "sys_user")
public class SysUser {
    @Id
    private Long userId;

    @Column(name = "user_name")
    private String userName;
}
`;

const ADMIN_CONTROLLER = `
package com.ruoyi.web.controller.system;

@RestController
@RequestMapping("/system/dept")
public class SysDeptController {
    @GetMapping("/list")
    public R list(SysDept dept) { return null; }
}
`;

const RUOYI_TREE: SourceFile[] = [
  { path: "ruoyi-system/pom.xml", content: POM },
  { path: "ruoyi-system/src/main/java/com/ruoyi/system/domain/SysDept.java", content: SYS_DEPT },
  { path: "ruoyi-system/src/main/java/com/ruoyi/system/domain/SysUser.java", content: SYS_USER },
  { path: "ruoyi-admin/pom.xml", content: POM },
  {
    path: "ruoyi-admin/src/main/resources/application.yml",
    content: "spring:\n  application:\n    name: ruoyi-admin\nserver:\n  port: 8080\n",
  },
  {
    path: "ruoyi-admin/src/main/java/com/ruoyi/web/controller/system/SysDeptController.java",
    content: ADMIN_CONTROLLER,
  },
  // Noise the scanner must ignore rather than count: images and lock files.
  { path: "ruoyi-admin/logo.png", content: "binary" },
  { path: "ruoyi-system/pom.xml.versionsBackup", content: "<project/>" },
];

describe("scanProject — a RuoYi-Pro multi-module build", () => {
  const result = scanProject(RUOYI_TREE);

  it("finds each Maven module as its own deployable unit", () => {
    expect(result.services.map((s) => s.name).sort()).toEqual(["ruoyi-admin", "ruoyi-system"]);
  });

  it("names a module from its Spring config, not its folder", () => {
    const admin = result.services.find((s) => s.path === "ruoyi-admin")!;
    expect(admin.name).toBe("ruoyi-admin");
  });

  it("stamps each entity with the module it ships in", () => {
    const dept = result.draft.seedNodeTypes.find((n) => n.typeName === "SysDept")!;
    expect(dept.origin).toMatchObject({
      kind: "java",
      service: "ruoyi-system",
      table: "sys_dept",
      stereotype: "entity",
    });
  });

  it("keeps the fields, Chinese-agnostic but column-accurate", () => {
    const user = result.draft.seedNodeTypes.find((n) => n.typeName === "SysUser")!;
    expect(user.properties!.userName).toEqual({ type: "string", column: "user_name" });
  });

  it("counts the admin module's routes as actions", () => {
    expect(result.draft.seedActions.map((a) => `${a.method} ${a.path}`)).toEqual([
      "GET /system/dept/list",
    ]);
  });

  it("does not count images as source", () => {
    expect(result.unsupported[".png"]).toBeUndefined();
    expect(result.byExtension[".java"]).toBe(3);
  });

  it("does not report build manifests as unreadable", () => {
    // pom.xml is consumed by the architecture pass; calling it unreadable would
    // bury the real gaps (MyBatis XML, configs) under build files.
    expect(result.unsupported[".xml"]).toBeUndefined();
    expect(result.unsupported[".versionsBackup"]).toBeUndefined();
  });
});

const CLOUD_TREE: SourceFile[] = [
  {
    path: "services/order-service/src/main/resources/application.yml",
    content: "spring:\n  application:\n    name: order-service\n  datasource:\n    url: jdbc:mysql://db/order\n",
  },
  { path: "services/order-service/pom.xml", content: POM },
  {
    path: "services/order-service/src/main/java/com/acme/order/domain/Order.java",
    content: "package com.acme.order.domain;\n@Entity\n@Table(name = \"orders\")\npublic class Order {\n  private String code;\n}",
  },
  {
    path: "services/payment-service/src/main/resources/application.yml",
    content: "spring:\n  application:\n    name: payment-service\n",
  },
  { path: "services/payment-service/pom.xml", content: POM },
];

describe("scanProject — a Spring Cloud microservice layout", () => {
  const result = scanProject(CLOUD_TREE);

  it("names services from spring.application.name", () => {
    expect(result.services.map((s) => s.name).sort()).toEqual(["order-service", "payment-service"]);
  });

  it("attributes a type to its microservice", () => {
    const order = result.draft.seedNodeTypes.find((n) => n.typeName === "Order")!;
    expect(order.origin?.service).toBe("order-service");
  });

  it("rolls type counts up per service", () => {
    expect(result.services.find((s) => s.name === "order-service")!.typeCount).toBe(1);
    expect(result.services.find((s) => s.name === "payment-service")!.typeCount).toBe(0);
  });
});

describe("scanProject — a gRPC contract repo", () => {
  const PROTO = `
package ecommerce.order.v1;
// 订单
message Order {
  string order_id = 1;
  repeated OrderItem items = 2;
}
message OrderItem { string sku = 1; }
service OrderService {
  rpc GetOrder(GetOrderRequest) returns (Order);
}
`;

  it("keeps the proto package's service when the tree declares none", () => {
    const result = scanProject([{ path: "proto/order.proto", content: PROTO }]);
    const order = result.draft.seedNodeTypes.find((n) => n.typeName === "Order")!;
    expect(order.origin).toMatchObject({ kind: "proto", service: "order" });
    expect(result.draft.seedActions).toHaveLength(1);
  });

  it("prefers the deployable unit when the tree does declare one", () => {
    const result = scanProject([
      { path: "order-service/pom.xml", content: POM },
      { path: "order-service/src/main/proto/order.proto", content: PROTO },
    ]);
    const order = result.draft.seedNodeTypes.find((n) => n.typeName === "Order")!;
    expect(order.origin?.service).toBe("order-service");
  });
});

describe("scanProject — reporting", () => {
  it("reports formats it cannot read instead of dropping them", () => {
    // A MyBatis mapper used to land here — the preview said "No parser yet:
    // .xml". It is read now, so this has to use a format that genuinely has no
    // parser, or the guard would stop guarding anything.
    const result = scanProject([
      { path: "api/service.thrift", content: "service Foo {}" },
      { path: "src/main/java/A.java", content: "public class A { private String x; }" },
      { path: "src/main/resources/mapper/SysUserMapper.xml", content: "<mapper/>" },
    ]);
    expect(result.unsupported[".thrift"]).toBe(1);
    expect(result.byExtension[".java"]).toBe(1);
    // A mapper is read now, even one that declares nothing.
    expect(result.byExtension[".xml"]).toBe(1);
    expect(result.unsupported[".xml"]).toBeUndefined();
  });

  it("applies the file ceiling and says so", () => {
    const files: SourceFile[] = Array.from({ length: MAX_FILES + 5 }, (_, i) => ({
      path: `src/A${i}.java`,
      content: "public class A { }",
    }));
    const result = scanProject(files);
    expect(result.truncationNote).toContain(String(MAX_FILES));
  });

  it("leaves a small scan untruncated", () => {
    expect(scanProject(RUOYI_TREE).truncationNote).toBeNull();
  });

  it("handles an empty tree", () => {
    const result = scanProject([]);
    expect(result.draft.seedNodeTypes).toEqual([]);
    expect(result.services).toEqual([]);
  });
});

describe("parseSpringAppName", () => {
  it("reads the nested YAML form", () => {
    expect(parseSpringAppName("spring:\n  application:\n    name: order-svc\n", "a.yml")).toBe("order-svc");
  });

  it("reads the flat YAML form", () => {
    expect(parseSpringAppName("spring.application.name: order-svc\n", "a.yml")).toBe("order-svc");
  });

  it("reads the properties form", () => {
    expect(parseSpringAppName("spring.application.name=order-svc\n", "a.properties")).toBe("order-svc");
  });

  it("is not fooled by a sibling of spring", () => {
    expect(
      parseSpringAppName("logging:\n  application:\n    name: nope\n", "a.yml"),
    ).toBeUndefined();
  });

  it("stops at a name that belongs to another application block", () => {
    const yaml = "spring:\n  application:\n    name: first\n  main:\n    banner-mode: off\n";
    expect(parseSpringAppName(yaml, "a.yml")).toBe("first");
  });

  it("returns undefined when the app does not name itself", () => {
    expect(parseSpringAppName("server:\n  port: 8080\n", "a.yml")).toBeUndefined();
  });
});

describe("readSpringAppName", () => {
  it("prefers the main resources file over a profile file", () => {
    const files: SourceFile[] = [
      { path: "app/src/main/resources/application-dev.yml", content: "spring:\n  application:\n    name: dev-name\n" },
      { path: "app/src/main/resources/application.yml", content: "spring:\n  application:\n    name: real-name\n" },
    ];
    expect(readSpringAppName(files, "app")).toBe("real-name");
  });
});
