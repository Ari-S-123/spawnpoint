#!/usr/bin/env python3
import sqlite3
import sqlite_vec
from pathlib import Path

db_path = Path("mcp_registry.db")

def drop_table():
    if not db_path.exists():
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    conn.enable_load_extension(True)
    try:
        sqlite_vec.load(conn)
        cursor = conn.cursor()
        print("Dropping tool_embeddings...")
        cursor.execute("DROP TABLE IF EXISTS tool_embeddings;")
        conn.commit()
        print("✓ Table dropped successfully.")
    except Exception as e:
        print(f"✗ Failed: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    drop_table()
