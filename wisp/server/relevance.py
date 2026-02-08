"""
Tool Relevance Retrieval Module

Handles FTS5 keyword search and Vector semantic search for MCP tools.
Uses embeddinggemma-300m for semantic embeddings and sqlite-vec for vector search.
"""

import json
import math
import numpy as np
import sqlite3
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from sentence_transformers import SentenceTransformer
from rich.progress import Progress

from db import DATABASE_PATH, get_connection

MODEL_NAME = "google/embeddinggemma-300m"

class RelevanceEngine:
    def __init__(self, db_path: Path = DATABASE_PATH):
        self.db_path = db_path
        self._model = None

    @property
    def model(self):
        if self._model is None:
            print(f"Loading model {MODEL_NAME}...")
            self._model = SentenceTransformer(MODEL_NAME, device="cpu") # Use cpu for stability, change to cuda/mps if available
        return self._model

    def warmup(self):
        """Pre-load the model into memory."""
        _ = self.model

    def build_search_index(self, progress: Optional[Progress] = None):
        """
        Populate the tools_search and tools_fts tables.
        """
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        
        # 1. Clear existing index
        cursor.execute("DELETE FROM tools_search")
        
        # 2. Fetch all tools with their server and parameters
        cursor.execute("""
            SELECT 
                t.id as tool_id, 
                t.tool_name, 
                t.title,
                t.description,
                t.server_name,
                s.description as server_description
            FROM tools t
            JOIN servers s ON t.server_name = s.name
        """)
        tools = cursor.fetchall()
        
        if progress:
            task_id = progress.add_task("[bold cyan]Building Search Index...", total=len(tools))
        else:
            task_id = None
            
        for tool in tools:
            tool_id = tool['tool_id']
            tool_name = tool['tool_name']
            server_name = tool['server_name']
            title = tool['title'] or ""
            description = tool['description'] or ""
            server_description = tool['server_description'] or ""
            
            # Fetch parameters
            cursor.execute("""
                SELECT param_name, description, enum_values
                FROM tool_parameters
                WHERE tool_name = ? AND server_name = ?
            """, (tool_name, server_name))
            params = cursor.fetchall()
            
            param_parts = []
            for p in params:
                p_text = f"{p['param_name']}: {p['description']}"
                if p['enum_values']:
                    p_text += f" (enums: {p['enum_values']})"
                param_parts.append(p_text)
            
            params_text = " | ".join(param_parts)
            
            # Construct segments
            # Move server_name out of name_text (weight 5.0) into desc_text (weight 3.0)
            name_text = f"{tool_name} {title}"
            desc_text = f"{description} {server_description}"
            
            # The full doc passed to the embedding model
            full_doc = f"Tool: {tool_name}\nServer: {server_name}\nTitle: {title}\nDescription: {description}\nServer Description: {server_description}\nParameters: {params_text}"
            
            cursor.execute("""
                INSERT INTO tools_search (tool_id, tool_name, server_name, name_text, desc_text, params_text, full_doc)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (tool_id, tool_name, server_name, name_text, desc_text, params_text, full_doc))
            
            if progress:
                progress.update(task_id, advance=1)
                
        # 3. Synchronize FTS5
        cursor.execute("INSERT INTO tools_fts(tools_fts) VALUES('rebuild')")
        
        conn.commit()
        conn.close()
        print("✓ Search index rebuilt.")

    def update_embeddings(self, progress: Optional[Progress] = None, batch_size: int = 16):
        """
        Generate and store embeddings for all tools.
        """
        conn = get_connection(self.db_path, load_vec=True)
        cursor = conn.cursor()
        
        # Get documents needing embeddings
        cursor.execute("""
            SELECT ts.tool_id, ts.full_doc 
            FROM tools_search ts
            LEFT JOIN tool_embeddings te ON ts.tool_id = te.tool_id
            WHERE te.tool_id IS NULL
        """)
        rows = cursor.fetchall()
        
        if not rows:
            print("All tools have up-to-date embeddings.")
            return

        total_tools = len(rows)
        if progress:
            task_id = progress.add_task("[bold magenta]Generating Embeddings...", total=total_tools)
        else:
            task_id = None
            print(f"Generating embeddings for {total_tools} tools in batches of {batch_size}...")

        for i in range(0, total_tools, batch_size):
            batch = rows[i:i + batch_size]
            batch_ids = [r['tool_id'] for r in batch]
            batch_docs = [r['full_doc'] for r in batch]
            
            # Generate embeddings for the batch
            # SentenceTransformers uses its own internal batching too, but this explicit loop
            # ensures we don't hold the entire results set in memory at once.
            embeddings = self.model.encode(batch_docs, show_progress_bar=False, convert_to_numpy=True)
            
            for tid, emb in zip(batch_ids, embeddings):
                # sqlite-vec expects a list or buffer
                cursor.execute(
                    "INSERT OR REPLACE INTO tool_embeddings(tool_id, embedding) VALUES (?, ?)",
                    (tid, emb.tobytes())
                )
            
            # Commit after each batch to free journal/memory and keep state
            conn.commit()
            
            if progress:
                progress.update(task_id, advance=len(batch))
                
        conn.close()
        print("✓ Tool embeddings updated.")

    def hybrid_search(self, query: str, limit: int = 10) -> List[Dict]:
        """
        Perform hybrid search using FTS5 and Vector Similarity.
        """
        conn = get_connection(self.db_path, load_vec=True)
        cursor = conn.cursor()
        
        # 1. Generate query embedding
        query_vec = self.model.encode(query, convert_to_numpy=True)
        
        # 2. Consolidated Discovery Query using CTEs
        # This performs both searches, normalizes BM25, joins with metadata/quality,
        # and calculates the final score in a single operation.
        # Sanitize for FTS5: Remove characters that break FTS5 MATCH syntax
        # We remove everything that isn't alphanumeric or space to be safe
        import re
        fts_query = re.sub(r'[^a-zA-Z0-9\s]', ' ', query).strip()

        cursor.execute("""
            WITH 
              -- Semantic candidates (Top 200)
              vector_hits AS (
                SELECT 
                    tool_id, 
                    (1.0 - vec_distance_cosine(embedding, ?)) as s_score
                FROM tool_embeddings
                ORDER BY s_score DESC 
                LIMIT 200
              ),
              -- Keyword candidates (Top 200)
              fts_hits AS (
                SELECT 
                    rowid as tool_id, 
                    (-bm25(tools_fts, 5.0, 3.0, 1.0)) as k_raw
                FROM tools_fts
                WHERE tools_fts MATCH ?
                ORDER BY k_raw DESC
                LIMIT 200
              ),
              -- Group stats for normalization
              k_stats AS (
                SELECT MAX(k_raw) as k_max FROM fts_hits
              )
            SELECT 
                ts.tool_id,
                ts.tool_name, 
                ts.server_name, 
                ts.desc_text,
                -- Combined Relevance: 0.7*Semantic + 0.3*NormalizedKeyword
                (
                  (0.7 * COALESCE(v.s_score, 0.0)) + 
                  (0.3 * COALESCE(log1p(k.k_raw) / log1p(NULLIF(ks.k_max, 0)), 0.0))
                ) as relevance,
                COALESCE(mr.total_score, 0) as quality
            FROM tools_search ts
            LEFT JOIN vector_hits v ON ts.tool_id = v.tool_id
            LEFT JOIN fts_hits k ON ts.tool_id = k.tool_id
            LEFT JOIN k_stats ks ON 1=1
            LEFT JOIN market_rankings mr ON ts.server_name = mr.server_name
            WHERE (v.tool_id IS NOT NULL OR k.tool_id IS NOT NULL)
              AND relevance > 0.3  -- Minimum relevance bar filter
            ORDER BY (0.8 * relevance) + (0.2 * quality) DESC
            LIMIT ?
        """, (query_vec.tobytes(), fts_query, limit))
        
        results = []
        for r in cursor.fetchall():
            relevance = r['relevance']
            quality = r['quality']
            results.append({
                'tool_id': r['tool_id'],
                'tool_name': r['tool_name'],
                'server_name': r['server_name'],
                'description': r['desc_text'],
                'relevance': relevance,
                'quality': quality,
                'final_score': (0.8 * relevance) + (0.2 * quality)
            })
            
        return results

if __name__ == "__main__":
    # Test script
    engine = RelevanceEngine()
    import sys
    if len(sys.argv) > 1 and sys.argv[1] in ("build", "build_index"):
        from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TimeRemainingColumn
        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeRemainingColumn(),
        ) as p:
            engine.build_search_index(p)
            engine.update_embeddings(p)
    elif len(sys.argv) > 1:
        query = sys.argv[1]
        results = engine.hybrid_search(query)
        print(f"\nSearch results for: '{query}'")
        for i, r in enumerate(results):
            print(f"{i+1}. {r['tool_name']} ({r['server_name']}) - Score: {r['final_score']:.3f} [Rel: {r['relevance']:.3f}, Qual: {r['quality']:.3f}]")
            print(f"   {r['description'][:100]}...")
