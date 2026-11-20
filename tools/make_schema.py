"""docs/DB設計書_StudyNest.xlsx から db/schema.sql をつくるスクリプト。
DB設計書を直したら、このスクリプトを実行して schema.sql を作り直します。
  python3 tools/make_schema.py
"""
import re, sys, pathlib
import openpyxl

ROOT = pathlib.Path(__file__).resolve().parent.parent
wb = openpyxl.load_workbook(ROOT / "docs" / "DB設計書_StudyNest.xlsx", data_only=True)

def default_of(note, typ):
    m = re.search(r"初期値\s*(TRUE|FALSE|0|1)", note or "")
    if m:
        return m.group(1)
    return None

out = ["-- このファイルは tools/make_schema.py が DB設計書 から自動で作ります。直接編集しないでください。",
       "SET NAMES utf8mb4;", "SET FOREIGN_KEY_CHECKS = 0;", ""]
for name in wb.sheetnames:
    if not name.endswith("_table"):
        continue
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    title = rows[2][2]
    cols, pks, idx = [], [], []
    for r in rows[4:]:
        no, jp, cid, pk, ix, req, typ, note = r[:8]
        if not cid:
            continue
        typ = str(typ).strip()
        line = f"  `{cid}` {typ}"
        if req == "〇" or pk == "〇":
            line += " NOT NULL"
        d = default_of(note, typ)
        if d is not None:
            line += f" DEFAULT {d}"
        if cid == "created_at":
            line += " DEFAULT CURRENT_TIMESTAMP"
        if cid == "updated_at":
            line += " NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP"
        if note and "自動採番" in note:
            line += " AUTO_INCREMENT"
        if note and "重複不可" in note:
            line += " UNIQUE"
        comment = (jp or "") + ("：" + note.replace("'", "") if note else "")
        line += f" COMMENT '{comment[:250]}'"
        cols.append(line)
        if pk == "〇":
            pks.append(cid)
        elif ix == "〇":
            idx.append(cid)
    body = cols[:]
    if pks:
        body.append("  PRIMARY KEY (" + ", ".join(f"`{c}`" for c in pks) + ")")
    for c in idx:
        body.append(f"  INDEX `idx_{c}` (`{c}`)")
    out.append(f"DROP TABLE IF EXISTS `{name}`;")
    out.append(f"CREATE TABLE `{name}` (\n" + ",\n".join(body) +
               f"\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='{title}';\n")
out.append("SET FOREIGN_KEY_CHECKS = 1;")
(ROOT / "db" / "schema.sql").write_text("\n".join(out) + "\n", encoding="utf-8")
print("db/schema.sql を作りました")
