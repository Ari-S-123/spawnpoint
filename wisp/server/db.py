#!/usr/bin/env python3
"""
Shared Database Utilities for MCP Registry

Contains database schema, connection utilities, and common constants.
"""

import math
import os
import sqlite3
from pathlib import Path
from typing import Optional


# Constants
DATABASE_PATH = Path(__file__).parent / "mcp_registry.db"
SQLITE_VEC_PATH = os.environ.get("SQLITE_VEC_PATH")  # Path to sqlite-vec extension if needed


def get_connection(db_path: Optional[Path] = None, load_vec: bool = False) -> sqlite3.Connection:
    """Get a database connection with row factory and WAL mode for better concurrency."""
    path = db_path or DATABASE_PATH
    conn = sqlite3.connect(path, timeout=30.0)  # Wait up to 30s for locks
    conn.row_factory = sqlite3.Row
    
    # Register common math functions not native to SQLite
    def safe_log1p(x):
        if x is None: return 0.0
        try:
            return math.log1p(max(0.0, float(x)))
        except (ValueError, TypeError):
            return 0.0
            
    conn.create_function("log1p", 1, safe_log1p)
    
    # Load vector extension if requested
    if load_vec:
        conn.enable_load_extension(True)
        # Attempt to load sqlite-vec
        try:
            import sqlite_vec
            sqlite_vec.load(conn)
        except ImportError:
            if SQLITE_VEC_PATH:
                conn.load_extension(SQLITE_VEC_PATH)
            else:
                # Fallback to common locations or just try loading it
                try:
                    conn.load_extension("vec0")
                except:
                    pass
    
    # Performance tuning
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    
    return conn


def create_full_schema(conn: sqlite3.Connection):
    """
    Create the complete database schema.
    
    Tables:
    - servers: Core server metadata from registry
    - server_packages: Package information (npm, pypi, docker, etc.)
    - server_remotes: Remote HTTP endpoints
    - environment_variables: Config vars with auth detection
    - server_icons: Server icons
    - tools: Actual tool definitions fetched from servers
    - tool_parameters: Detailed tool parameter schemas
    - resources: MCP resources from servers
    - prompts: MCP prompts from servers
    """
    cursor = conn.cursor()
    
    # ==================== REGISTRY TABLES ====================
    
    # Main servers table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            version TEXT,
            schema_url TEXT,
            repository_url TEXT,
            repository_source TEXT,
            website_url TEXT,
            is_latest BOOLEAN,
            status TEXT,
            published_at TIMESTAMP,
            updated_at TIMESTAMP,
            raw_json TEXT,
            extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Server packages table (npm, pypi, docker, etc.)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS server_packages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            registry_type TEXT,
            identifier TEXT,
            version TEXT,
            transport_type TEXT,
            transport_url TEXT,
            runtime_hint TEXT,
            file_sha256 TEXT,
            raw_json TEXT,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Server remote endpoints (for HTTP-based servers)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS server_remotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            transport_type TEXT,
            url TEXT,
            headers_json TEXT,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Environment variables table (with auth detection)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS environment_variables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            var_name TEXT NOT NULL,
            description TEXT,
            is_required BOOLEAN DEFAULT FALSE,
            is_secret BOOLEAN DEFAULT FALSE,
            format TEXT,
            default_value TEXT,
            choices TEXT,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Server icons table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS server_icons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            src TEXT,
            mime_type TEXT,
            theme TEXT,
            sizes TEXT,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # ==================== RUNTIME TABLES ====================
    # (populated by connecting to actual MCP servers)
    
    # Tools table - actual tool definitions from servers
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            title TEXT,
            description TEXT,
            input_schema TEXT,
            output_schema TEXT,
            extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_name, tool_name),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Tool parameters table for detailed analysis
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tool_parameters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            param_name TEXT NOT NULL,
            param_type TEXT,
            description TEXT,
            is_required BOOLEAN DEFAULT FALSE,
            default_value TEXT,
            enum_values TEXT,
            UNIQUE(server_name, tool_name, param_name),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Resources table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            uri TEXT NOT NULL,
            name TEXT,
            description TEXT,
            mime_type TEXT,
            extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_name, uri),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Prompts table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            prompt_name TEXT NOT NULL,
            description TEXT,
            arguments_json TEXT,
            extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_name, prompt_name),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Connection attempts log (for tracking which servers we've tried)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS connection_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            connection_type TEXT,
            url_or_command TEXT,
            success BOOLEAN,
            error_message TEXT,
            tools_count INTEGER,
            resources_count INTEGER,
            prompts_count INTEGER,
            attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Tool extraction status - tracks current status per server (upserted each run)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tool_extraction_status (
            server_name TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK(status IN ('success', 'permanent_failure', 'transient_failure', 'pending')),
            failure_category TEXT,
            failure_reason TEXT,
            tools_count INTEGER DEFAULT 0,
            resources_count INTEGER DEFAULT 0,
            prompts_count INTEGER DEFAULT 0,
            connection_method TEXT,
            last_attempted_at TIMESTAMP,
            last_successful_at TIMESTAMP,
            retry_count INTEGER DEFAULT 0,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Enrichment status - tracks failures per enrichment type to skip permanent failures
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS enrichment_status (
            server_name TEXT NOT NULL,
            enrichment_type TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('success', 'permanent_failure', 'transient_failure')),
            failure_reason TEXT,
            last_attempted_at TIMESTAMP,
            retry_count INTEGER DEFAULT 0,
            PRIMARY KEY (server_name, enrichment_type),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Local source paths - for servers run from cloned repos
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS server_local_sources (
            server_name TEXT PRIMARY KEY,
            command TEXT NOT NULL,
            args_json TEXT,
            working_dir TEXT,
            env_json TEXT,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # ==================== BACKLINK/DEPENDENCY TABLES ====================
    
    # Dependency signals from libraries.io
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS dependency_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            package_name TEXT NOT NULL,
            platform TEXT,
            dependents_count INTEGER,
            dependent_repos_count INTEGER,
            sourcerank INTEGER,
            enriched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_name, package_name),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Config file references from GitHub code search
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS config_references (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            search_term TEXT NOT NULL,
            config_type TEXT NOT NULL,
            reference_count INTEGER DEFAULT 0,
            sample_repos TEXT,
            enriched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_name, config_type),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # ==================== BACKLINK SCORING TABLES ====================
    
    # Individual backlink edges with quality metrics
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS backlink_edges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT NOT NULL,
            referencer_repo TEXT NOT NULL,
            tier TEXT NOT NULL,
            tier_weight REAL NOT NULL,
            repo_stars INTEGER DEFAULT 0,
            repo_pushed_at TIMESTAMP,
            is_archived BOOLEAN DEFAULT FALSE,
            is_fork BOOLEAN DEFAULT FALSE,
            edge_score REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(server_name, referencer_repo, tier),
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Aggregated backlink scores per server
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS backlink_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_name TEXT UNIQUE NOT NULL,
            raw_score REAL DEFAULT 0,
            normalized_score REAL DEFAULT 0,
            tier1_contribution REAL DEFAULT 0,
            tier2_contribution REAL DEFAULT 0,
            tier3_contribution REAL DEFAULT 0,
            tier4_contribution REAL DEFAULT 0,
            unique_repos INTEGER DEFAULT 0,
            computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Marketplace rankings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS market_rankings (
            server_name TEXT PRIMARY KEY,
            total_score REAL DEFAULT 0,
            usage_score REAL DEFAULT 0,
            reputation_score REAL DEFAULT 0,
            activity_score REAL DEFAULT 0,
            reach_score REAL DEFAULT 0,
            is_zero_auth BOOLEAN DEFAULT FALSE,
            is_verified BOOLEAN DEFAULT FALSE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_name) REFERENCES servers(name)
        )
    """)
    
    # Tool Search (Flattened documents)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS tools_search (
            tool_id INTEGER PRIMARY KEY,
            tool_name TEXT,
            server_name TEXT,
            name_text TEXT,
            desc_text TEXT,
            params_text TEXT,
            full_doc TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tool_id) REFERENCES tools(id)
        )
    """)
    
    # Tool FTS (Virtual table for keyword search)
    cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS tools_fts USING fts5(
            name_text,
            desc_text,
            params_text,
            content='tools_search',
            content_rowid='tool_id'
        )
    """)
    
    # Tool Embeddings (Virtual table for vector search via sqlite-vec)
    # We load the extension before creating this
    try:
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS tool_embeddings USING vec0(
                tool_id INTEGER PRIMARY KEY,
                embedding FLOAT[768]
            )
        """)
    except sqlite3.OperationalError as e:
        # If sqlite-vec is not loaded/available, we skip for now but log
        print(f"Warning: Could not create tool_embeddings table (sqlite-vec likely missing): {e}")
    
    # ==================== INDEXES ====================
    
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_servers_updated ON servers(updated_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_packages_server ON server_packages(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_packages_registry ON server_packages(registry_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_remotes_server ON server_remotes(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_env_server ON environment_variables(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_env_secret ON environment_variables(is_secret)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tools_server ON tools(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(tool_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_resources_server ON resources(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_prompts_server ON prompts(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_deps_server ON dependency_signals(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_deps_count ON dependency_signals(dependents_count)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_config_server ON config_references(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_config_type ON config_references(config_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_edges_server ON backlink_edges(server_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_edges_repo ON backlink_edges(referencer_repo)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_edges_tier ON backlink_edges(tier)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_scores_normalized ON backlink_scores(normalized_score)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rankings_score ON market_rankings(total_score)")
    
    conn.commit()



# ==================== VIEW HELPERS ====================

def create_views(conn: sqlite3.Connection, force: bool = False):
    """Create useful views for querying."""
    cursor = conn.cursor()
    
    # Server summary view with auth requirements
    if force:
        cursor.execute("DROP VIEW IF EXISTS v_server_summary")
        create_sql = "CREATE VIEW v_server_summary AS"
    else:
        create_sql = "CREATE VIEW IF NOT EXISTS v_server_summary AS"
        
    cursor.execute(f"""
        {create_sql}
        SELECT 
            s.name,
            s.description,
            s.version,
            s.status,
            s.repository_url,
            s.updated_at,
            COALESCE(
                (SELECT GROUP_CONCAT(DISTINCT sp.registry_type) 
                 FROM server_packages sp WHERE sp.server_name = s.name),
                (SELECT GROUP_CONCAT(DISTINCT sr.transport_type) 
                 FROM server_remotes sr WHERE sr.server_name = s.name)
            ) as package_types,
            (SELECT COUNT(*) FROM environment_variables ev 
             WHERE ev.server_name = s.name AND ev.is_secret = 1) as auth_vars_count,
            (SELECT COUNT(*) FROM tools t WHERE t.server_name = s.name) as tools_count,
            (SELECT COUNT(*) FROM resources r WHERE r.server_name = s.name) as resources_count,
            (SELECT sr.url FROM server_remotes sr 
             WHERE sr.server_name = s.name LIMIT 1) as remote_url,
            mr.total_score as market_rank
        FROM servers s
        LEFT JOIN market_rankings mr ON s.name = mr.server_name
    """)
    
    # Tools with server info
    if force:
        cursor.execute("DROP VIEW IF EXISTS v_tools_full")
        create_sql = "CREATE VIEW v_tools_full AS"
    else:
        create_sql = "CREATE VIEW IF NOT EXISTS v_tools_full AS"

    cursor.execute(f"""
        {create_sql}
        SELECT 
            t.id as tool_id,
            t.tool_name,
            t.title,
            t.description,
            t.input_schema,
            s.name as server_name,
            s.description as server_description,
            (SELECT COUNT(*) FROM environment_variables ev 
             WHERE ev.server_name = s.name AND ev.is_secret = 1) > 0 as requires_auth
        FROM tools t
        JOIN servers s ON t.server_name = s.name
    """)
    
    conn.commit()


def init_database(db_path: Optional[Path] = None, load_vec: bool = False, refresh_views: bool = False) -> sqlite3.Connection:
    """Initialize database with full schema and views."""
    conn = get_connection(db_path, load_vec=load_vec)
    create_full_schema(conn)
    create_views(conn, force=refresh_views)
    return conn


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Initialize the Wisp Database")
    parser.add_argument("--refresh-views", action="store_true", help="Force recreation of all database views")
    args = parser.parse_args()
    
    print("🛠️ Initializing Wisp Database...")
    conn = init_database(refresh_views=args.refresh_views)
    conn.close()
    print("✓ Done.")
