/**
 * The Java/Kotlin pass.
 *
 * These fixtures are the shapes the plugin actually has to read: a JEECGBoot /
 * MyBatis-Plus entity, a RuoYi-Pro / JPA entity, and a Spring controller. The
 * old parser turned every one of them into a bare class name — no fields, no
 * table, no package — which is why imported Java domains had nothing in them.
 */
import { describe, expect, it } from "vitest";
import {
  javaTypeToSchemaType,
  moduleFromJavaPackage,
  parseJavaFile,
  stripJavaComments,
} from "../src/cognition/javaParser.js";
import { extractRepoDraft, parseSourceFile } from "../src/cognition/AstExtractor.js";

const JEECG_ENTITY = `
package org.jeecg.modules.system.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

/**
 * 用户表
 */
@Data
@TableName("sys_user")
@ApiModel(value = "用户对象", description = "用户信息")
public class SysUser implements Serializable {
    private static final long serialVersionUID = 1L;
    private static final Logger log = LoggerFactory.getLogger(SysUser.class);

    /** 主键 */
    @TableId("id")
    private String id;

    @Excel(name = "用户名")
    @TableField("username")
    private String username;

    @Excel(name = "真实姓名")
    private String realName;

    @TableField("dept_id")
    private String deptId;

    @TableField("age")
    private Integer age;

    private SysDept dept;
}
`;

const RUOYI_ENTITY = `
package com.ruoyi.system.domain;

@Entity
@Table(name = "sys_dept")
public class SysDept extends BaseEntity {
    @Id
    private Long deptId;

    @Column(name = "dept_name")
    private String deptName;

    @ManyToOne
    @JoinColumn(name = "parent_id")
    private SysDept parent;
}
`;

const CONTROLLER = `
package com.ruoyi.system.controller;

@RestController
@RequestMapping("/system/user")
public class SysUserController {
    @GetMapping("/list")
    public R list(SysUser user) { return null; }

    @PostMapping
    public R add(@RequestBody SysUser user) { return null; }

    @RequestMapping(value = "/export", method = RequestMethod.POST)
    public void export() { }

    @DeleteMapping("/{id}")
    public R remove(@PathVariable Long id) { return ok(); }
}
`;

describe("parseJavaFile — a MyBatis-Plus / JEECGBoot entity", () => {
  const result = parseJavaFile(JEECG_ENTITY, "SysUser.java");
  const entity = result.entities[0]!;

  it("reads the mapped table, package and module", () => {
    expect(entity.origin).toMatchObject({
      kind: "java",
      namespace: "org.jeecg.modules.system.entity",
      service: "system",
      table: "sys_user",
      stereotype: "entity",
    });
  });

  it("uses the Chinese name from @ApiModel", () => {
    expect(entity.displayName).toBe("用户对象");
    expect(entity.description).toBe("用户信息");
  });

  it("extracts every field, not just the class name", () => {
    expect(entity.properties?.map((p) => p.name)).toEqual([
      "id", "username", "realName", "deptId", "age", "dept",
    ]);
  });

  it("takes the Chinese label from @Excel and the column from @TableField", () => {
    const username = entity.properties!.find((p) => p.name === "username")!;
    expect(username.description).toBe("用户名");
    expect(username.column).toBe("username");
    const deptId = entity.properties!.find((p) => p.name === "deptId")!;
    expect(deptId.column).toBe("dept_id");
  });

  it("maps Java types onto schema types", () => {
    const types = Object.fromEntries(entity.properties!.map((p) => [p.name, p.type]));
    expect(types.age).toBe("number");
    expect(types.realName).toBe("string");
  });

  it("remembers the field's declared class so relations can be derived", () => {
    expect(entity.properties!.find((p) => p.name === "dept")!.declaredType).toBe("SysDept");
  });

  it("skips plumbing fields", () => {
    const names = entity.properties!.map((p) => p.name);
    expect(names).not.toContain("serialVersionUID");
    expect(names).not.toContain("log");
  });
});

describe("parseJavaFile — a RuoYi / JPA entity", () => {
  const entity = parseJavaFile(RUOYI_ENTITY, "SysDept.java").entities[0]!;

  it("reads @Table(name = …)", () => {
    expect(entity.origin?.table).toBe("sys_dept");
    expect(entity.origin?.service).toBe("system");
  });

  it("reads @Column(name = …) and numeric types", () => {
    const props = Object.fromEntries(entity.properties!.map((p) => [p.name, p]));
    expect(props.deptName!.column).toBe("dept_name");
    expect(props.deptId!.type).toBe("number");
    expect(props.parent!.declaredType).toBe("SysDept");
  });
});

describe("parseJavaFile — a Spring controller", () => {
  const result = parseJavaFile(CONTROLLER, "SysUserController.java");

  it("joins the class-level @RequestMapping prefix onto each method", () => {
    expect(result.actions.map((a) => `${a.httpMethod} ${a.routePath}`)).toEqual([
      "GET /system/user/list",
      "POST /system/user",
      "POST /system/user/export",
      "DELETE /system/user/{id}",
    ]);
  });

  it("reads the HTTP verb out of @RequestMapping(method = …)", () => {
    const exported = result.actions.find((a) => a.routePath === "/system/user/export")!;
    expect(exported.httpMethod).toBe("POST");
  });

  it("points the action at the type it operates on when @RequestBody says so", () => {
    const add = result.actions.find((a) => a.routePath === "/system/user")!;
    expect(add.targetEntity).toBe("SysUser");
  });

  it("does not turn the controller itself into a business object", () => {
    expect(result.entities).toEqual([]);
  });
});

describe("parseJavaFile — robustness", () => {
  it("ignores commented-out code", () => {
    const source = `
package com.example.order.service;
// class Ghost {
//   private String x;
// }
/* class AlsoGhost { private String y; } */
public class Real { private String kept; }
`;
    const result = parseJavaFile(source, "Real.java");
    expect(result.entities.map((e) => e.typeName)).toEqual(["Real"]);
  });

  it("does not let a // inside a string swallow the rest of the line", () => {
    const source = `
public class Link {
    private String url = "http://example.com/a";
    private String kept;
}
`;
    expect(stripJavaComments(source)).toContain('"http://example.com/a"');
    const entity = parseJavaFile(source, "Link.java").entities[0]!;
    expect(entity.properties?.map((p) => p.name)).toEqual(["url", "kept"]);
  });

  it("captures an enum's vocabulary", () => {
    const source = `
package com.example.order.enums;
public enum OrderStatus {
    CREATED, PAID, SHIPPED;
}
`;
    const entity = parseJavaFile(source, "OrderStatus.java").entities[0]!;
    expect(entity.origin?.stereotype).toBe("enum");
    expect(entity.properties?.[0]?.description).toBe("CREATED / PAID / SHIPPED");
  });

  it("reads Kotlin properties", () => {
    const source = `
package com.example.order.service

data class OrderDto(
    val orderId: String,
    var amount: BigDecimal
)
`;
    const entity = parseJavaFile(source, "OrderDto.kt").entities[0]!;
    const props = Object.fromEntries(entity.properties?.map((p) => [p.name, p.type]) ?? []);
    expect(props.orderId).toBe("string");
  });

  it("survives a declaration with no body", () => {
    expect(() => parseJavaFile("public class Broken", "Broken.java")).not.toThrow();
  });

  it("is reachable through the shared dispatcher", () => {
    const dispatched = parseSourceFile("SysDept.java", RUOYI_ENTITY).entities[0]!;
    expect(dispatched.origin?.table).toBe("sys_dept");
  });
});

describe("moduleFromJavaPackage", () => {
  it.each([
    ["org.jeecg.modules.system.entity", "system"],
    ["com.ruoyi.system.domain", "system"],
    ["com.example.order.service.impl", "order"],
    ["com.acme", undefined],
    ["io.github.payments", "payments"],
  ])("%s → %s", (pkg, expected) => {
    expect(moduleFromJavaPackage(pkg)).toBe(expected);
  });
});

describe("javaTypeToSchemaType", () => {
  it.each([
    ["String", "string"],
    ["Long", "number"],
    ["BigDecimal", "number"],
    ["boolean", "boolean"],
    ["List<SysDept>", "array"],
    ["Map<String, Object>", "object"],
    ["LocalDateTime", "string"],
    ["java.util.List<java.lang.String>", "array"],
  ])("%s → %s", (javaType, expected) => {
    expect(javaTypeToSchemaType(javaType)).toBe(expected);
  });
});

describe("extractRepoDraft over a Java scan", () => {
  const draft = extractRepoDraft([
    { path: "src/main/java/com/ruoyi/system/domain/SysDept.java", content: RUOYI_ENTITY },
    { path: "src/main/java/com/ruoyi/system/entity/SysUser.java", content: JEECG_ENTITY },
    { path: "src/main/java/com/ruoyi/system/controller/SysUserController.java", content: CONTROLLER },
  ]);

  it("carries origin through into the seed types", () => {
    const user = draft.seedNodeTypes.find((n) => n.typeName === "SysUser")!;
    expect(user.origin).toMatchObject({ kind: "java", table: "sys_user", service: "system" });
  });

  it("persists fields, Chinese labels and column names", () => {
    const user = draft.seedNodeTypes.find((n) => n.typeName === "SysUser")!;
    expect(user.properties!.username).toEqual({
      type: "string",
      description: "用户名",
      column: "username",
    });
  });

  it("turns a field typed as another scanned type into a relation", () => {
    const keys = [...draft.seedRelationTypes].map((r) => r.relationType);
    expect(keys).toContain("references");
    expect(draft.coverage.relationCount).toBeGreaterThan(0);
  });

  it("does not invent relations for JDK types", () => {
    const draft2 = extractRepoDraft([
      { path: "a.java", content: "public class A { private String name; private Long id; }" },
    ]);
    expect(draft2.coverage.relationCount).toBe(0);
  });

  it("counts the controller's routes as actions", () => {
    expect(draft.seedActions).toHaveLength(4);
  });
});
