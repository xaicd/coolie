/**
 * MyBatis mapper XML.
 *
 * These were being counted and skipped — the import preview said "No parser
 * yet: .xml×N" — which is a real gap for JEECGBoot and RuoYi, where the mapper
 * is the more common way to state which field is which column.
 *
 * What a mapper contributes is the *mapping*, not a second object model. A field
 * whose type the mapper never stated must not come back as "string", and a
 * mapper type must merge with the Java one rather than shadowing it.
 *
 * It also names the tables its statements touch, which for a plain MyBatis
 * project is the only artifact that does. Those are keyed by the table name as
 * written, so they land on the type a DDL `CREATE TABLE` already produced rather
 * than beside it — and the tests below pin both halves: the mapper still does not
 * shadow the class, and the table still merges with the DDL.
 */
import { describe, expect, it } from "vitest";
import {
  parseMyBatisMapper,
  tablesInSql,
} from "@paperclipai/ontology-core/cognition/mybatisParser.js";
import { extractRepoDraft, parseSourceFile } from "@paperclipai/ontology-core/cognition/AstExtractor.js";

const MAPPER = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.ruoyi.system.mapper.SysUserMapper">

  <resultMap type="com.ruoyi.system.domain.SysUser" id="SysUserResult">
    <id     property="userId"   column="user_id"     />
    <result property="userName" column="user_name"   />
    <result property="realName" column="real_name"   />
    <result property="deptId"   column="dept_id"     />
  </resultMap>

  <sql id="selectUserVo">
    select user_id, user_name from sys_user
  </sql>

  <select id="selectUserList" resultMap="SysUserResult">
    <include refid="selectUserVo"/>
  </select>

  <insert id="insertUser" parameterType="com.ruoyi.system.domain.SysUser">
    insert into sys_user (user_id) values (#{userId})
  </insert>

  <update id="updateUser" resultType="com.ruoyi.system.domain.SysUser">
    update sys_user set user_name = #{userName}
  </update>

  <delete id="deleteUserById">delete from sys_user where user_id = #{id}</delete>

  <!-- <select id="commentedOut" resultMap="SysUserResult">select 1</select> -->
</mapper>
`;

const JAVA = `
package com.ruoyi.system.domain;
@Entity
@Table(name = "sys_user")
public class SysUser {
    private Long userId;
    private String userName;
    private String realName;
    private Long deptId;
}
`;

describe("parseMyBatisMapper", () => {
  const result = parseMyBatisMapper(MAPPER, "SysUserMapper.xml");

  it("is inert for XML that is not a mapper", () => {
    // Most XML in a Java project is configuration.
    const config = parseMyBatisMapper("<configuration><appender/></configuration>", "logback.xml");
    expect(config).toEqual({ entities: [], relations: [], actions: [] });
    expect(parseMyBatisMapper("", "empty.xml").entities).toEqual([]);
  });

  it("keys the class by its simple name, so it merges with the Java type", () => {
    // The invariant is that there is exactly *one* class-derived type — a mapper
    // copy beside the Java class was the original bug. `sys_user` is not a copy:
    // it is the table, and it is keyed the way DDL keys a table.
    expect(result.entities.filter((e) => e.origin?.stereotype !== "table").map((e) => e.typeName))
      .toEqual(["SysUser"]);
    expect(result.entities.map((e) => e.typeName)).toEqual(["SysUser", "sys_user"]);
  });

  it("reads the column mapping, whichever order the attributes are in", () => {
    const props = Object.fromEntries(result.entities[0]!.properties!.map((p) => [p.name, p.column]));
    expect(props).toEqual({
      userId: "user_id",
      userName: "user_name",
      realName: "real_name",
      deptId: "dept_id",
    });
  });

  it("never invents a type the mapper did not state", () => {
    // The Java side knows the type; a mapper that filled in "string" would
    // overwrite it with a guess.
    expect(result.entities[0]!.properties!.every((p) => p.type === undefined)).toBe(true);
  });

  it("records where it came from", () => {
    expect(result.entities[0]!.origin).toMatchObject({
      kind: "mybatis",
      namespace: "com.ruoyi.system.mapper.SysUserMapper",
    });
  });

  it("does not turn statements into actions", () => {
    // An action type here is an HTTP-shaped contract (`httpMethod` / `routePath`),
    // and a mapper statement is a data operation. Emitting one would mean either
    // calling `selectUserList` a POST — which is false — or inventing a second
    // action shape; and it would put every query in a codebase into the action
    // list. The mapper's contribution is the column mapping.
    expect(result.actions).toEqual([]);
  });

  it("still reads a mapper that only has statements, without inventing a type", () => {
    const bare = parseMyBatisMapper(
      '<mapper namespace="a.B"><select id="x">select 1</select></mapper>',
      "B.xml",
    );
    expect(bare.entities).toEqual([]);
    expect(bare.actions).toEqual([]);
  });

  it("is reachable through the shared dispatcher", () => {
    expect(parseSourceFile("SysUserMapper.xml", MAPPER).entities).toHaveLength(2);
  });
});

describe("the tables a mapper's SQL names", () => {
  const result = parseMyBatisMapper(MAPPER, "SysUserMapper.xml");

  it("reads the table from each clause that names one", () => {
    expect(tablesInSql("select a from sys_user where id = 1")).toEqual(["sys_user"]);
    expect(tablesInSql("insert into sys_dept (id) values (1)")).toEqual(["sys_dept"]);
    expect(tablesInSql("update sys_role set name = 'x'")).toEqual(["sys_role"]);
    expect(tablesInSql("delete from sys_menu where id = 1")).toEqual(["sys_menu"]);
  });

  it("reads joined tables and a comma-separated from list", () => {
    expect(tablesInSql("select * from sys_user u left join sys_dept d on u.dept_id = d.id").sort())
      .toEqual(["sys_dept", "sys_user"]);
    expect(tablesInSql("select * from sys_user u, sys_dept d where u.dept_id = d.id").sort())
      .toEqual(["sys_dept", "sys_user"]);
  });

  it("ends the from list at the keyword that ends the clause", () => {
    // `join` has its own rule; without the stop list it would be read as another
    // from-entry and the word `join` would be recorded as a table.
    expect(tablesInSql("select * from sys_user union select * from sys_dept").sort())
      .toEqual(["sys_dept", "sys_user"]);
    expect(tablesInSql("select * from sys_user where id = 1").sort()).toEqual(["sys_user"]);
  });

  it("reads a table named inside a subquery", () => {
    expect(tablesInSql("select t.id from (select id from sys_user) t")).toEqual(["sys_user"]);
  });

  it("refuses a table it cannot name rather than guessing one", () => {
    // A `${…}` name resolves at run time, so the word inside the braces is not a
    // table; `dual` is the Oracle no-table query. Recording either would put a
    // table in the model that does not exist.
    expect(tablesInSql("select * from ${tableName}")).toEqual([]);
    expect(tablesInSql("select sysdate from dual")).toEqual([]);
    expect(tablesInSql("select 1")).toEqual([]);
  });

  it("ignores a commented-out statement", () => {
    expect(tablesInSql("-- from sys_user\nselect 1")).toEqual([]);
    expect(tablesInSql("select 1 /* from sys_user */")).toEqual([]);
  });

  it("takes the table from a <sql> fragment the statements only include", () => {
    // The sample's only `select` holds nothing but `<include refid="selectUserVo"/>`.
    // Reading statements alone would find no table at all here.
    expect([...tablesInSql("select user_id, user_name from sys_user")]).toEqual(["sys_user"]);
    const entities = new Set(result.entities.map((e) => e.typeName));
    expect(entities.has("sys_user")).toBe(true);
  });

  it("gives a SQL-only table no columns", () => {
    // The mapper states the table's name and its columns, but not which of a
    // joined statement's tables a column belongs to. A field attributed to the
    // wrong table is worse than a missing one.
    const table = result.entities.find((e) => e.typeName === "sys_user")!;
    expect(table.properties).toBeUndefined();
    expect(table.origin).toMatchObject({ kind: "mybatis", stereotype: "table", table: "sys_user" });
  });

  it("links the class to the table when the mapper leaves one candidate of each", () => {
    expect(result.relations).toEqual([
      {
        sourceType: "SysUser",
        targetType: "sys_user",
        relationType: "maps_to",
        sourceFile: "SysUserMapper.xml",
      },
    ]);
  });

  it("emits no such link when a join makes the pairing ambiguous", () => {
    // Two classes and two tables produce four equally plausible pairings, and
    // three of them are wrong. A wrong edge reads as a modelling decision.
    const join = parseMyBatisMapper(
      `<mapper namespace="a.Joiner">
         <resultMap type="a.SysUser" id="u"><id property="id" column="user_id"/></resultMap>
         <resultMap type="a.SysDept" id="d"><id property="id" column="dept_id"/></resultMap>
         <select id="list" resultMap="u">
           select u.user_id from sys_user u join sys_dept d on u.dept_id = d.id
         </select>
       </mapper>`,
      "Joiner.xml",
    );
    expect(join.relations).toEqual([]);
    expect(join.entities.map((e) => e.typeName).sort()).toEqual(["SysDept", "SysUser", "sys_dept", "sys_user"]);
  });
});

describe("a mapper enriches the Java type instead of shadowing it", () => {
  const draft = extractRepoDraft([
    { path: "src/main/java/com/ruoyi/system/domain/SysUser.java", content: JAVA },
    { path: "src/main/resources/mapper/SysUserMapper.xml", content: MAPPER },
  ]);

  it("produces the Java type once, plus the table", () => {
    // Still one `SysUser` — the mapper does not shadow the class. The table is a
    // second, different thing the mapper is the first source to name.
    expect(draft.seedNodeTypes.map((n) => n.typeName)).toEqual(["SysUser", "sys_user"]);
  });

  it("carries the column mapping onto the fields the Java side typed", () => {
    const user = draft.seedNodeTypes[0]!;
    expect(user.properties!.userName).toMatchObject({ type: "string", column: "user_name" });
    expect(user.properties!.userId).toMatchObject({ column: "user_id" });
  });

  it("keeps the Java-side table mapping", () => {
    // The Java annotation knows the table; the mapper does not state one.
    expect(draft.seedNodeTypes[0]!.origin).toMatchObject({ kind: "java", table: "sys_user" });
  });

  it("adds no actions of its own", () => {
    // The mapper contributes fields, not operations.
    expect(draft.seedActions).toEqual([]);
  });

  it("lands the mapper's table on the type the DDL already declared, not beside it", () => {
    // The point of keying tables verbatim. A DDL-declared table and a mapper that
    // queries it are one entity with the DDL's columns and both files recorded.
    const ddl = extractRepoDraft([
      {
        path: "sql/schema.sql",
        content: "create table sys_user (user_id bigint primary key, user_name varchar(64));",
      },
      { path: "src/main/resources/mapper/SysUserMapper.xml", content: MAPPER },
    ]);
    const tables = ddl.seedNodeTypes.filter((n) => n.typeName === "sys_user");
    expect(tables).toHaveLength(1);
    expect(Object.keys(tables[0]!.properties ?? {}).sort()).toEqual(["user_id", "user_name"]);
    expect(tables[0]!.sourceFiles.sort()).toEqual([
      "sql/schema.sql",
      "src/main/resources/mapper/SysUserMapper.xml",
    ]);
  });

  it("keeps the Java-side field type while taking the mapper's column", () => {
    const user = draft.seedNodeTypes[0]!;
    const realName = user.properties!.realName as Record<string, unknown>;
    // The Java side typed it; the mapper named the column. Neither is dropped.
    expect(realName.type).toBe("string");
    expect(realName.column).toBe("real_name");
  });
});
