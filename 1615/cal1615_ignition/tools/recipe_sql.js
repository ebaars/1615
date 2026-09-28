// SQL recipe handling (same approach as cal2016: a recipe table plus named queries), used by pages.js.
// Table rcp_cal1615 on the gateway database connection DB (SQL Server); one FLOAT column per recipe member.
module.exports = ({ fs, path, OUT, NOW, keys }) => {
  const DB = "mySQL";
  const TABLE = "rcp_cal1615";
  const FOLDER = "cal1615 Recipe";
  const writeNamedQuery = (name, sql, type, params = []) => {
    const dir = path.join(OUT, "ignition/named-query", FOLDER, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "query.sql"), sql);
    fs.writeFileSync(path.join(dir, "resource.json"), JSON.stringify({
      scope: "DG", version: 2, restricted: false, overridable: true, files: ["query.sql"],
      attributes: {
        useMaxReturnSize: false, autoBatchEnabled: false, fallbackValue: "", maxReturnSize: 100, cacheUnit: "SEC", type,
        enabled: true, cacheAmount: 1, cacheEnabled: false, database: DB, fallbackEnabled: false,
        permissions: [{ zone: "", role: "" }], lastModification: { actor: "claude", timestamp: NOW },
        syntaxProvider: "class com.adbs.syntax.MSSQLSyntaxProvider",
        // sqlType 7 = String, 4 = Float8 (as in cal2016's Recipe Line queries)
        parameters: params.map(([id, t]) => ({ type: "Parameter", identifier: id, sqlType: t === "s" ? 7 : 4 })),
      },
    }, null, 2));
  };
  const cols = keys.map((k) => `\t[${k}]`).join(",\n");
  const createSql = `IF OBJECT_ID(N'dbo.${TABLE}', N'U') IS NULL
CREATE TABLE dbo.${TABLE} (
\tid INT IDENTITY(1,1) PRIMARY KEY,
\tname NVARCHAR(100) NOT NULL UNIQUE,
\tcomments NVARCHAR(255) NULL,
${keys.map((k) => `\t[${k}] FLOAT NULL,`).join("\n")}
\tmodified DATETIME NOT NULL DEFAULT GETDATE()
)`;
  writeNamedQuery("Create Table", createSql, "UpdateQuery");
  writeNamedQuery("Recipe List", `SELECT name, modified FROM dbo.${TABLE} ORDER BY name`, "Query");
  writeNamedQuery("Recipe Names", `SELECT name FROM dbo.${TABLE} WHERE name = :name`, "Query", [["name", "s"]]);
  writeNamedQuery("Recipe Get", `SELECT name,\n${cols}\nFROM dbo.${TABLE}\nWHERE name = :name`, "Query", [["name", "s"]]);
  writeNamedQuery("Recipe Add", `INSERT INTO dbo.${TABLE} (\n\tname,\n${cols}\n)\nVALUES (\n\t:name,\n${keys.map((k) => `\t:${k}`).join(",\n")}\n)`,
    "UpdateQuery", [["name", "s"], ...keys.map((k) => [k, "f"])]);
  writeNamedQuery("Recipe Edit", `UPDATE dbo.${TABLE}\nSET\n${keys.map((k) => `\t[${k}] = :${k},`).join("\n")}\n\tmodified = GETDATE()\nWHERE name = :name`,
    "UpdateQuery", [["name", "s"], ...keys.map((k) => [k, "f"])]);
  writeNamedQuery("Recipe Delete", `DELETE FROM dbo.${TABLE} WHERE name = :name`, "UpdateQuery", [["name", "s"]]);
  // Plain script for a DBA who prefers to create the table by hand.
  fs.mkdirSync(path.join(OUT, "sql"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "sql", `${TABLE}.sql`), `-- cal1615 recipe table (database connection "${DB}", SQL Server).\n-- The HMI also creates it on first use via the named query "${FOLDER}/Create Table".\n${createSql}\n`);
  return { FOLDER, TABLE, DB };
};
