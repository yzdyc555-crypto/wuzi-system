# -*- coding: utf-8 -*-
"""
PostgreSQL 兼容层：模拟 sqlite3 连接接口，使 app.py 现有业务代码零改动即可切换到云端 PostgreSQL。

用法：
  1) 设置环境变量 DATABASE_URL（形如 postgresql://user:pass@host/dbname）后，本模块自动使用 PostgreSQL。
  2) 未设置时，自动回退到本地 SQLite（data/system.db），保证本地开发/测试不受影响。

兼容的特性（对应 app.py 中用到的 sqlite3 用法）：
  - db.execute(sql, params)          -> 自动将 '?' 占位符转换为 '%s'
  - cur.fetchone() / cur.fetchall()  -> 行对象支持 row["col"] 与 row["col"] 属性访问
  - cur.lastrowid                    -> INSERT ... RETURNING id
  - db.executescript(script)         -> 建表脚本
  - db.commit() / db.close() / db.rowcount
  - PRAGMA table_info(表名)          -> 返回列名集合（用于自动迁移判断），转换为 information_schema 查询
"""
import os
import re
import sqlite3

# ---------------------------------------------------------------- 判定后端
_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()


def use_postgres():
    """是否启用 PostgreSQL（设置了 DATABASE_URL 即启用）。"""
    return bool(_DATABASE_URL)


# ---------------------------------------------------------------- PostgreSQL 行对象
class PGRow:
    """字典式行：支持 row["col"] 与 row.col 访问。"""

    __slots__ = ("_mapping",)

    def __init__(self, mapping):
        self._mapping = mapping

    def __getitem__(self, key):
        return self._mapping[key]

    def __getattr__(self, key):
        try:
            return self._mapping[key]
        except KeyError:
            raise AttributeError(key)

    def keys(self):
        return list(self._mapping.keys())

    def values(self):
        return list(self._mapping.values())

    def items(self):
        return list(self._mapping.items())

    def get(self, key, default=None):
        return self._mapping.get(key, default)

    def __contains__(self, key):
        return key in self._mapping

    def __iter__(self):
        return iter(self._mapping.values())


# ---------------------------------------------------------------- SQL 转换
_PLACEHOLDER_RE = re.compile(r"\?")


def _convert_sql(sql):
    """将 SQLite 的 '?' 占位符转换为 psycopg 的 '%s'。"""
    return _PLACEHOLDER_RE.sub("%s", sql)


# '?' 嵌套占位（多个参数复用）不适用于本系统，忽略。


# ---------------------------------------------------------------- 游标对象
class PGCursor:
    """模拟 sqlite3.Cursor，底层为 psycopg cursor。"""

    def __init__(self, pg_conn, pg_cursor):
        self._pg_conn = pg_conn
        self._cursor = pg_cursor
        self._description = None
        self._rows = []
        self._fetch_index = 0
        self.rowcount = -1
        self.lastrowid = None
        self.arraysize = 1
        self.row_factory = None

    def execute(self, sql, params=None):
        self._execute_impl(sql, params)
        return self

    def executemany(self, sql, seq_of_params):
        for p in seq_of_params:
            self._execute_impl(sql, p)
        return self

    def _execute_impl(self, sql, params=None):
        if params is None:
            params = ()
        if not isinstance(params, (tuple, list)):
            params = (params,)
        s = sql.strip().lower()
        # PRAGMA table_info(表) -> 从 information_schema 返回列信息
        m = re.match(r"pragma\s+table_info\s*\(\s*([\w\"\']+)\s*\)", s)
        if m:
            table = m.group(1).strip("\"'")
            cols = self._pg_conn._table_columns(table)
            self._rows = [(i, c, "TEXT", 0, None, 0) for i, c in enumerate(cols)]
            self._description = [
                ("cid", None, None, None, None, None, None),
                ("name", None, None, None, None, None, None),
                ("type", None, None, None, None, None, None),
                ("notnull", None, None, None, None, None, None),
                ("dflt_value", None, None, None, None, None, None),
                ("pk", None, None, None, None, None, None),
            ]
            self._fetch_index = 0
            self.rowcount = len(cols)
            self.lastrowid = None
            return
        # 其它 PRAGMA（如 foreign_keys）直接忽略
        if s.startswith("pragma"):
            self._rows = []
            self._description = None
            self._fetch_index = 0
            self.rowcount = -1
            self.lastrowid = None
            return
        conv_sql = _convert_sql(sql)
        # 若为 INSERT INTO <表>（不含 RETURNING），自动追加 RETURNING 主键列，
        # 使 lastrowid 在 PostgreSQL 下也能生效（业务代码依赖 cur.lastrowid）。
        if conv_sql.strip().lower().startswith("insert into") and "returning" not in conv_sql.lower():
            m = re.match(r"insert\s+into\s+([\"\w]+)", conv_sql, flags=re.IGNORECASE)
            if m:
                pk = self._pg_conn._primary_key(m.group(1).strip('"'))
                if pk:
                    conv_sql = conv_sql.rstrip("; \t\n\r") + " RETURNING " + pk
        try:
            self._cursor.execute(conv_sql, list(params))
        except Exception:
            raise
        # 记录结果
        try:
            self._description = self._cursor.description
        except Exception:
            self._description = None
        # 取回所有行（数据量小，一次性拉取）
        self._rows = []
        self._fetch_index = 0
        try:
            if self._description is not None and self._cursor.description:
                self._rows = self._cursor.fetchall()
        except Exception:
            self._rows = []
        # rowcount / lastrowid
        try:
            self.rowcount = self._cursor.rowcount
        except Exception:
            self.rowcount = -1
        # lastrowid：若刚执行 INSERT 且 SQL 含 RETURNING，则取回自增主键
        if sql.strip().lower().startswith("insert"):
            self._try_lastrowid(conv_sql)
        return self

    def _try_lastrowid(self, sql):
        low = sql.lower()
        if "returning" in low and self._rows:
            row = self._rows[0]
            if isinstance(row, tuple):
                self.lastrowid = row[0]
            else:
                try:
                    self.lastrowid = row["id"]
                except Exception:
                    self.lastrowid = None
            self._rows = []  # 已消费
            self._fetch_index = 0

    # ---- 结果获取 ----
    def _fetch_column_names(self):
        if self._description:
            return [d[0] for d in self._description]
        return []

    def _current_rows_as_rows(self):
        """将 psycopg 返回的 tuple 行转换为 PGRow（支持 row['col']）。"""
        cols = self._fetch_column_names()
        if not cols:
            return []
        out = []
        for row in self._rows:
            out.append(PGRow(dict(zip(cols, row))))
        return out

    def fetchone(self):
        if self._fetch_index >= len(self._rows):
            return None
        one = self._rows[self._fetch_index]
        self._fetch_index += 1
        cols = self._fetch_column_names()
        if cols:
            return PGRow(dict(zip(cols, one)))
        return one

    def fetchall(self):
        cols = self._fetch_column_names()
        if not cols:
            res = self._rows
            self._rows = []
            self._fetch_index = 0
            return res
        out = []
        for row in self._rows:
            out.append(PGRow(dict(zip(cols, row))))
        self._rows = []
        self._fetch_index = 0
        return out

    def fetchmany(self, size=None):
        if size is None:
            size = self.arraysize
        out = []
        while len(out) < size and self._fetch_index < len(self._rows):
            one = self._rows[self._fetch_index]
            self._fetch_index += 1
            cols = self._fetch_column_names()
            if cols:
                out.append(PGRow(dict(zip(cols, one))))
            else:
                out.append(one)
        return out

    def close(self):
        try:
            self._cursor.close()
        except Exception:
            pass


# ---------------------------------------------------------------- 连接对象
class PGConnection:
    """模拟 sqlite3.Connection，底层为 psycopg 连接。"""

    def __init__(self, pg_conn):
        self._pg_conn = pg_conn
        self.row_factory = None

    # ---- execute 快捷方式（sqlite3 风格）----
    def execute(self, sql, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def executescript(self, script):
        """执行多条 SQL 脚本（用于建表）。逐条拆分执行，并转换为 PostgreSQL 语法。"""
        # 拆分：按分号（行尾，忽略字符串内的分号——本系统建表脚本简单，可安全按行处理）
        statements = _split_statements(script)
        cur = self._pg_conn.cursor()
        for st in statements:
            try:
                cur.execute(_convert_pg_ddl(st))
            except Exception:
                # 若语句已存在（IF NOT EXISTS）或错误，忽略，保证幂等
                pass
        self._pg_conn.commit()
        cur.close()

    def cursor(self):
        pg_cur = self._pg_conn.cursor()
        return PGCursor(self, pg_cur)

    def commit(self):
        try:
            self._pg_conn.commit()
        except Exception:
            pass

    def rollback(self):
        try:
            self._pg_conn.rollback()
        except Exception:
            pass

    def close(self):
        try:
            self._pg_conn.close()
        except Exception:
            pass

    def total_changes(self):
        return 0

    # ---- 便捷查询 ----
    def _table_columns(self, table):
        """返回某表所有列名（用于 PRAGMA table_info 模拟）。"""
        cur = self._pg_conn.cursor()
        cur.execute(
            """SELECT column_name FROM information_schema.columns
               WHERE table_name = %s ORDER BY ordinal_position""",
            (table,),
        )
        rows = cur.fetchall()
        cur.close()
        return [r[0] for r in rows]

    def pragma_table_info(self, table):
        """返回 PRAGMA table_info(表名) 风格的行列表（PGRow）。"""
        cols = self._table_columns(table)
        out = []
        for i, c in enumerate(cols, 1):
            out.append(PGRow({"cid": i - 1, "name": c, "type": "TEXT",
                              "notnull": 0, "dflt_value": None, "pk": 0}))
        return out

    def _primary_key(self, table):
        """返回表的主键列名（无主键则返回 None）。"""
        cur = self._pg_conn.cursor()
        try:
            cur.execute(
                """SELECT kcu.column_name
                   FROM information_schema.table_constraints tc
                   JOIN information_schema.key_column_usage kcu
                     ON tc.constraint_name = kcu.constraint_name
                    AND tc.table_schema = kcu.table_schema
                   WHERE tc.constraint_type = 'PRIMARY KEY'
                     AND tc.table_name = %s
                   ORDER BY kcu.ordinal_position
                   LIMIT 1""",
                (table,),
            )
            row = cur.fetchone()
            return row[0] if row else None
        except Exception:
            return None
        finally:
            cur.close()


def _convert_pg_ddl(sql):
    """将 SQLite 建表 DDL 转换为 PostgreSQL 兼容语法。"""
    low = sql.strip().lower()
    if not low.startswith("create table"):
        return sql
    out = sql
    # id INTEGER PRIMARY KEY AUTOINCREMENT -> BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
    out = re.sub(
        r"\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b",
        "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY",
        out,
        flags=re.IGNORECASE,
    )
    # 备用：PRIMARY KEY AUTOINCREMENT（无 INTEGER 前缀）-> BIGSERIAL PRIMARY KEY
    out = re.sub(
        r"\bPRIMARY\s+KEY\s+AUTOINCREMENT\b",
        "PRIMARY KEY",
        out,
        flags=re.IGNORECASE,
    )
    return out


def _split_statements(script):
    """将建表脚本按 ';' 拆分为单条语句，去掉空语句与注释。"""
    stmts = []
    for raw in script.split(";"):
        line = raw.strip()
        if not line:
            continue
        # 去掉行内注释
        line = re.sub(r"--.*", "", line)
        line = line.strip()
        if line:
            stmts.append(line + ";")
    return stmts


# ---------------------------------------------------------------- 工厂函数
def connect(database=None):
    """
    返回一个模拟 sqlite3.Connection 的对象。
    - 若设置了 DATABASE_URL -> PGConnection（PostgreSQL）
    - 否则 -> sqlite3.Connection（本地 SQLite）
    """
    if use_postgres():
        try:
            import psycopg
        except ImportError:
            # 兼容 psycopg2
            try:
                import psycopg2
                pg = psycopg2.connect(_DATABASE_URL)
            except Exception:
                pg = None
            if pg is None:
                raise RuntimeError("psycopg/psycopg2 未安装，无法连接 PostgreSQL")
            conn = PGConnection(pg)
            conn._driver = "psycopg2"
            return conn
        pg = psycopg.connect(_DATABASE_URL)
        conn = PGConnection(pg)
        conn._driver = "psycopg"
        return conn
    else:
        # 本地 SQLite
        db = sqlite3.connect(database if database else os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "data", "system.db"))
        db.row_factory = sqlite3.Row
        return db
