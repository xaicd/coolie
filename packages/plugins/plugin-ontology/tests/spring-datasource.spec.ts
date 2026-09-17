/**
 * The database a service connects to.
 *
 * A legacy "distributed" system is very often several services on one database,
 * and nothing in the code says so: two services touching different tables of one
 * schema are invisible to a table-name match. The connection string is where it
 * is stated, and it lives in `application.yml` / `.properties` — the files the
 * object-type scan reports as unread, because they describe no object type.
 *
 * The reader refuses more than it reads, on purpose. A database name taken out of
 * the wrong part of a url would pair two services that share nothing, and that
 * pairing would read as a finding somebody made.
 */
import { describe, expect, it } from "vitest";
import { analyzeArchitecture, type SourceFile } from "@paperclipai/ontology-core/architecture/index.js";
import { parseSpringDatasource } from "@paperclipai/ontology-core/architecture/serviceDetector.js";

const file = (path: string, content: string): SourceFile => ({ path, content });

const yml = (url: string) => "spring:\n  datasource:\n    url: " + url + "\n";

describe("parseSpringDatasource", () => {
  it("reads the nested yaml form, dropping the url's parameters", () => {
    expect(parseSpringDatasource(yml("jdbc:mysql://db:3306/ruoyi?useUnicode=true&characterEncoding=utf8"), "application.yml"))
      .toMatchObject({ vendor: "mysql", host: "db", port: 3306, database: "ruoyi" });
  });

  it("reads the flattened yaml key form", () => {
    expect(parseSpringDatasource("spring.datasource.url: jdbc:postgresql://pg:5432/ruoyi\n", "application.yml"))
      .toMatchObject({ vendor: "postgresql", host: "pg", port: 5432, database: "ruoyi" });
  });

  it("reads a .properties file", () => {
    expect(parseSpringDatasource("spring.datasource.url=jdbc:mysql://db:3306/ruoyi\n", "application.properties"))
      .toMatchObject({ database: "ruoyi" });
  });

  it("reads the pooled and multi-datasource key shapes", () => {
    expect(parseSpringDatasource("spring:\n  datasource:\n    druid:\n      url: jdbc:mysql://db:3306/ruoyi\n", "a.yml"))
      .toMatchObject({ database: "ruoyi" });
    expect(parseSpringDatasource("spring:\n  datasource:\n    master:\n      url: jdbc:mysql://db:3306/ruoyi\n", "a.yml"))
      .toMatchObject({ database: "ruoyi" });
  });

  it("reads the oracle and sqlserver shapes", () => {
    expect(parseSpringDatasource(yml("jdbc:oracle:thin:@orcl:1521:ORCL"), "a.yml"))
      .toMatchObject({ vendor: "oracle", host: "orcl", port: 1521, database: "ORCL" });
    expect(parseSpringDatasource(yml("jdbc:sqlserver://mssql:1433;databaseName=ruoyi"), "a.yml"))
      .toMatchObject({ vendor: "sqlserver", host: "mssql", port: 1433, database: "ruoyi" });
  });

  it("refuses a url it cannot resolve instead of guessing a database", () => {
    // A `${…}` default applies only where the variable is unset, so the effective
    // url is not knowable from the file. Reading `MYSQL_URL` as a database name —
    // or the fallback as the truth — would invent a finding.
    const placeholder = "spring:\n  datasource:\n    url: " + "${MYSQL_URL}\n";
    expect(parseSpringDatasource(placeholder, "a.yml")).toBeUndefined();
    expect(parseSpringDatasource(yml("jdbc:h2:mem:test"), "a.yml")).toBeUndefined();
    expect(parseSpringDatasource("logging:\n  level:\n    root: info\n", "a.yml")).toBeUndefined();
  });

  it("records the file and the key it read", () => {
    expect(parseSpringDatasource(yml("jdbc:mysql://db:3306/ruoyi"), "src/main/resources/application.yml")?.evidence)
      .toBe("src/main/resources/application.yml:spring.datasource.url");
  });
});

const service = (dir: string, name: string, url: string): SourceFile[] => [
  file(dir + "/pom.xml", "<project><artifactId>" + name + "</artifactId></project>"),
  file(dir + "/src/main/resources/application.yml", "spring:\n  application:\n    name: " + name + "\n  datasource:\n    url: " + url + "\n"),
];

describe("analyzeArchitecture — shared databases", () => {
  it("reports two services on one database, with the config file of each", () => {
    const analysis = analyzeArchitecture([
      ...service("repo/ruoyi-system", "ruoyi-system", "jdbc:mysql://db:3306/ruoyi"),
      ...service("repo/ruoyi-job", "ruoyi-job", "jdbc:mysql://db:3306/ruoyi"),
    ]);
    expect(analysis.sharedDatabases).toHaveLength(1);
    expect(analysis.sharedDatabases[0]!.database).toBe("ruoyi");
    expect(analysis.sharedDatabases[0]!.where).toBe("db:3306");
    expect(analysis.sharedDatabases[0]!.services.sort()).toEqual(["ruoyi-job", "ruoyi-system"]);
    expect(analysis.sharedDatabases[0]!.evidence).toHaveLength(2);
  });

  it("keeps a service's own database off the list", () => {
    // One service on a database is not a finding — that is just how it is wired.
    const analysis = analyzeArchitecture([...service("repo/a", "a", "jdbc:mysql://db:3306/ruoyi")]);
    expect(analysis.sharedDatabases).toEqual([]);
    expect(analysis.services[0]!.datasource).toMatchObject({ database: "ruoyi", host: "db" });
  });

  it("does not join services whose database name matches on different hosts", () => {
    // `ruoyi` on two hosts is two databases. Calling it shared would put a
    // coupling in the map that nobody could act on.
    const analysis = analyzeArchitecture([
      ...service("repo/a", "a", "jdbc:mysql://db-one:3306/ruoyi"),
      ...service("repo/b", "b", "jdbc:mysql://db-two:3306/ruoyi"),
    ]);
    expect(analysis.sharedDatabases).toEqual([]);
  });

  it("reports a service with no readable datasource without inventing one", () => {
    const analysis = analyzeArchitecture([file("repo/a/pom.xml", "<project/>")]);
    expect(analysis.services[0]!.datasource).toBeUndefined();
    expect(analysis.sharedDatabases).toEqual([]);
  });
});
