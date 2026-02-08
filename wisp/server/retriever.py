#!/usr/bin/env python3
"""
Tool Retriever Module

Provides a high-level interface for tool discovery, hydration, and paging.
Wraps the RelevanceEngine and fetches full tool/server metadata.
"""

import json
import sqlite3
from pathlib import Path
from typing import List, Dict, Optional, Any

from db import DATABASE_PATH, get_connection
from relevance import RelevanceEngine

class Retriever:
    def __init__(self, db_path: Path = DATABASE_PATH):
        self.db_path = db_path
        self.relevance_engine = RelevanceEngine(db_path)

    def warmup(self):
        """Pre-load the relevance engine (model)."""
        self.relevance_engine.warmup()

    def retrieve(self, query: str, page: int = 1, limit: int = 10) -> Dict[str, Any]:
        """
        Retrieve tools matching the query with full hydration and paging.
        """
        # We fetch a larger candidate set initially to allow for discovery
        # across both relevance and marketplace quality.
        candidate_limit = 100
        candidates = self.relevance_engine.hybrid_search(query, limit=candidate_limit)
        
        total_results = len(candidates)
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        
        paged_candidates = candidates[start_idx:end_idx]
        
        # Hydrate candidates with full metadata in batches
        if not paged_candidates:
            return {
                "query": query,
                "page": page,
                "limit": limit,
                "total_candidates": total_results,
                "results": []
            }
            
        tool_ids = [c['tool_id'] for c in paged_candidates]
        cand_map = {c['tool_id']: c for c in paged_candidates}
        
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        
        # 1. Fetch all tool/server metadata for this page
        placeholders = ",".join(["?"] * len(tool_ids))
        cursor.execute(f"""
            SELECT 
                t.id as tool_id,
                vt.tool_name,
                vt.title,
                vt.description,
                vt.requires_auth,
                vt.server_name,
                vt.server_description,
                vt.input_schema
            FROM tools t
            JOIN v_tools_full vt ON t.id = vt.tool_id
            WHERE t.id IN ({placeholders})
        """, tuple(tool_ids))
        
        db_results = cursor.fetchall()
        
        final_results = []
        for db_r in db_results:
            tid = db_r['tool_id']
            cand = cand_map[tid]
            
            # Parse input_schema if present
            input_schema = None
            if db_r['input_schema']:
                try:
                    input_schema = json.loads(db_r['input_schema'])
                except json.JSONDecodeError:
                    pass

            final_results.append({
                "tool_id": tid,
                "name": db_r['tool_name'],
                "title": db_r['title'],
                "description": db_r['description'],
                "input_schema": input_schema,
                "requires_auth": bool(db_r['requires_auth']),
                "server": {
                    "name": db_r['server_name'],
                    "description": db_r['server_description']
                },
                "relevance": cand['relevance'],
                "quality": cand['quality'],
                "score": cand['final_score']
            })
            
        # Re-sort by score as the DB query might lose ordering
        final_results.sort(key=lambda x: x['score'], reverse=True)
            
        conn.close()
        
        return {
            "query": query,
            "page": page,
            "limit": limit,
            "total_candidates": total_results,
            "results": final_results
        }

    def get_tools_for_server(self, server_name: str) -> List[Dict[str, Any]]:
        """
        Retrieve all tools for a given server name.
        """
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT 
                tool_id,
                tool_name,
                title,
                description,
                requires_auth,
                server_name,
                server_description,
                input_schema
            FROM v_tools_full 
            WHERE server_name = ?
        """, (server_name,))
        
        db_results = cursor.fetchall()
        conn.close()
        
        results = []
        for db_r in db_results:
            # Parse input_schema if present
            input_schema = None
            if db_r['input_schema']:
                try:
                    input_schema = json.loads(db_r['input_schema'])
                except json.JSONDecodeError:
                    pass

            results.append({
                "tool_id": db_r['tool_id'],
                "name": db_r['tool_name'],
                "title": db_r['title'],
                "description": db_r['description'],
                "input_schema": input_schema,
                "requires_auth": bool(db_r['requires_auth']),
                "server": {
                    "name": db_r['server_name'],
                    "description": db_r['server_description']
                }
            })
            
        return results
