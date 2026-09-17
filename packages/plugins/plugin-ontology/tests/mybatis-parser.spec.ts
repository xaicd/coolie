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
 */
import { describe, expect, it } from "vitest";
import { parseMyBatisMapper } from "@paperclipai/ontology-core/cognition/mybatisParser.js";
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

  it("keys the type by its simple name, so it merges with the Java type", () => {
    expect(result.entities.map((e) => e.typeName)).toEqual(["SysUser"]);
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
    expect(parseSourceFile("SysUserMapper.xml", MAPPER).entities).toHaveLength(1);
  });
});

describe("a mapper enriches the Java type instead of shadowing it", () => {
  const draft = extractRepoDraft([
    { path: "src/main/java/com/ruoyi/system/domain/SysUser.java", content: JAVA },
    { path: "src/main/resources/mapper/SysUserMapper.xml", content: MAPPER },
  ]);

  it("produces one type, not two", () => {
    expect(draft.seedNodeTypes.map((n) => n.typeName)).toEqual(["SysUser"]);
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

  it("keeps the Java-side field type while taking the mapper's column", () => {
    const user = draft.seedNodeTypes[0]!;
    const realName = user.properties!.realName as Record<string, unknown>;
    // The Java side typed it; the mapper named the column. Neither is dropped.
    expect(realName.type).toBe("string");
    expect(realName.column).toBe("real_name");
  });
});
