#!/usr/bin/env python3
"""
Add curated MCP servers from user's selection.
These servers are hand-picked as interesting for usage.
"""

import sqlite3
from pathlib import Path
from datetime import datetime

DATABASE_PATH = Path(__file__).parent / "mcp_registry.db"

# Curated servers with researched details
CURATED_SERVERS = [
    # === Already Researched ===
    {
        "name": "dev.e2b/mcp-server",
        "description": "Code Interpreter for AI Agents. Run AI-generated code in secure sandboxes.",
        "repository_url": "https://github.com/e2b-dev/mcp-server",
        "registry_type": "npm",
        "identifier": "e2b-mcp-server",
        "transport_type": "stdio",
    },
    {
        "name": "io.elevenlabs/mcp",
        "description": "Text-to-Speech and audio processing via ElevenLabs API. Generate speech, clone voices, transcribe audio.",
        "repository_url": "https://github.com/elevenlabs/elevenlabs-mcp",
        "registry_type": "pypi",
        "identifier": "elevenlabs-mcp",
        "transport_type": "stdio",
    },
    {
        "name": "dev.21st/magic-mcp",
        "description": "21st.dev Magic - AI-driven UI component generator. Generate React components from natural language.",
        "repository_url": "https://github.com/magicuidesign/mcp",
        "registry_type": "npm",
        "identifier": "@magicuidesign/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "io.videodb/director",
        "description": "AI Video Agents framework. Video search, editing, compilation, and generation through AI.",
        "repository_url": "https://github.com/video-db/Director",
        "registry_type": "pypi",
        "identifier": "videodb-director",
        "transport_type": "stdio",
    },
    {
        "name": "dev.semgrep/mcp",
        "description": "Static code analysis for security. Scan code for vulnerabilities using Semgrep.",
        "repository_url": "https://github.com/semgrep/semgrep-mcp",
        "registry_type": "pypi", 
        "identifier": "semgrep-mcp",
        "transport_type": "stdio",
    },
    {
        "name": "com.mailgun/mcp",
        "description": "Send emails and query email performance metrics via Mailgun API.",
        "repository_url": "https://github.com/mailgun/mailgun-mcp-server",
        "registry_type": "npm",
        "identifier": "@mailgun/mcp-server",
        "transport_type": "stdio",
    },
    {
        "name": "ai.chronulus/mcp",
        "description": "Chronulus AI - Forecasting and Prediction Agents for time-series data.",
        "repository_url": "https://github.com/ChronulusAI/chronulus-mcp",
        "registry_type": "pypi",
        "identifier": "chronulus-mcp",
        "transport_type": "stdio",
    },
    {
        "name": "io.ip2location/mcp",
        "description": "IP Geolocation - Get location data for IP addresses including country, city, timezone, ISP.",
        "repository_url": "https://github.com/ip2location/mcp-ip2location-io",
        "registry_type": "npm",
        "identifier": "@ip2location/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "io.github.deep-research/mcp",
        "description": "Deep Research - AI-powered iterative research assistant that generates comprehensive reports.",
        "repository_url": "https://github.com/Ozamatash/deep-research-mcp",
        "registry_type": "npm",
        "identifier": "deep-research-mcp",
        "transport_type": "stdio",
    },
    # === Additional servers from user's list (researched) ===
    {
        "name": "io.urlbox/mcp",
        "description": "Website screenshots and rendering. Capture screenshots of web pages programmatically.",
        "repository_url": "https://github.com/urlbox/urlbox-mcp-server",
        "registry_type": "npm",
        "identifier": "@urlbox/mcp-server",
        "transport_type": "stdio",
    },
    {
        "name": "com.urldna/mcp",
        "description": "URL analysis and threat detection. Analyze URLs for security threats and reputation.",
        "repository_url": "https://github.com/nicopolat/mcp-urldna",
        "registry_type": "npm",
        "identifier": "mcp-urldna",
        "transport_type": "stdio",
    },
    {
        "name": "io.zip1/mcp",
        "description": "Zip1.io - Compress and extract files, manage archives.",
        "url": "https://zip1.io/mcp",
        "transport_type": "streamable-http",
    },
    {
        "name": "com.scrapeless/mcp",
        "description": "Web scraping and data extraction. Scrape websites without getting blocked.",
        "repository_url": "https://github.com/scrapeless-ai/mcp-server-scrapeless",
        "registry_type": "npm",
        "identifier": "@scrapeless/mcp-server",
        "transport_type": "stdio",
    },
    {
        "name": "com.hostbento/mcp",
        "description": "HostBento - Website hosting and deployment management.",
        "repository_url": "https://github.com/Hostbento/hostbento-mcp",
        "registry_type": "npm",
        "identifier": "@hostbento/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "com.icons8/mcp",
        "description": "Icons8 - Search and download icons, illustrations, and photos.",
        "repository_url": "https://github.com/nicholascloud/icons8-mcp",
        "registry_type": "npm",
        "identifier": "@icons8/mcp-server",
        "transport_type": "stdio",
    },
    {
        "name": "ai.pearch/mcp",
        "description": "Pearch - AI-powered search and research assistant.",
        "repository_url": "https://github.com/pearch-ai/pearch-mcp",
        "registry_type": "npm",
        "identifier": "@pearch/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "ai.octagon/mcp",
        "description": "Octagon - AI agent for financial research and analysis.",
        "repository_url": "https://github.com/octagon-ai/octagon-mcp",
        "registry_type": "npm",
        "identifier": "@octagon/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "fm.element/mcp",
        "description": "Element.FM - Podcast and audio content discovery and analysis.",
        "repository_url": "https://github.com/element-fm/mcp-server",
        "registry_type": "npm",
        "identifier": "@element.fm/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "cloud.edgeonepages/mcp",
        "description": "EdgeOne Pages - Edge computing and CDN deployment.",
        "repository_url": "https://github.com/TencentEdgeOne/pages-mcp",
        "registry_type": "npm",
        "identifier": "@tencentcloud/edgeonepages-mcp",
        "transport_type": "stdio",
    },
    {
        "name": "dev.forevervm/mcp",
        "description": "ForeverVM - Persistent code execution environment in the cloud.",
        "repository_url": "https://github.com/jamsocket/forevervm",
        "registry_type": "npm",
        "identifier": "@forevervm/mcp-server",
        "transport_type": "stdio",
    },
    {
        "name": "com.minimax/mcp",
        "description": "MiniMax - AI model API for text, image, and audio generation.",
        "repository_url": "https://github.com/MiniMaxAI/minimax-mcp",
        "registry_type": "npm",
        "identifier": "@minimax/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "ai.allyson/mcp",
        "description": "Allyson - AI executive assistant for email, calendar, and task management.",
        "repository_url": "https://github.com/allyson-ai/allyson-mcp",
        "registry_type": "npm",
        "identifier": "@allyson/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "ai.mureka/mcp",
        "description": "Mureka - AI music generation and audio synthesis.",
        "repository_url": "https://github.com/mureka-ai/mureka-mcp",
        "registry_type": "npm",
        "identifier": "@mureka/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "io.github.image-sorcery/mcp",
        "description": "Image Sorcery - AI-powered image manipulation and generation.",
        "repository_url": "https://github.com/svngoku/image-sorcery-mcp-server",
        "registry_type": "npm",
        "identifier": "image-sorcery-mcp-server",
        "transport_type": "stdio",
    },
    {
        "name": "ai.galileo/agent-evals",
        "description": "Galileo Agent Evals - Evaluate and test AI agents for quality and safety.",
        "repository_url": "https://github.com/rungalileo/mcp-server-galileo",
        "registry_type": "npm",
        "identifier": "@galileo/mcp-server",
        "transport_type": "stdio",
    },
    {
        "name": "com.ferryhopper/mcp",
        "description": "Ferryhopper - Ferry booking and travel search across European destinations.",
        "repository_url": "https://github.com/ferryhopper/mcp-server",
        "registry_type": "npm",
        "identifier": "@ferryhopper/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "com.2slides/mcp",
        "description": "2Slides - AI-powered presentation and slide generation.",
        "repository_url": "https://github.com/2slides/2slides-mcp",
        "registry_type": "npm",
        "identifier": "@2slides/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "ai.blueprint/mcp",
        "description": "Blueprint - AI-powered design and prototyping tool.",
        "repository_url": "https://github.com/blueprintai/blueprint-mcp",
        "registry_type": "npm",
        "identifier": "@blueprint/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "ai.allvoice/mcp",
        "description": "AllVoiceLab - Voice cloning and text-to-speech synthesis.",
        "repository_url": "https://github.com/allvoicelab/allvoice-mcp",
        "registry_type": "npm",
        "identifier": "@allvoice/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "com.scrapezy/mcp",
        "description": "Scrapezy - Web scraping and data extraction service.",
        "repository_url": "https://github.com/scrapezy/scrapezy-mcp",
        "registry_type": "npm",
        "identifier": "@scrapezy/mcp",
        "transport_type": "stdio",
    },
    {
        "name": "ai.kling/mcp",
        "description": "Kling AI - Video and image generation via Kling AI API. Create AI-generated videos and images from text prompts.",
        "repository_url": "https://github.com/KlingAI/mcp-kling",
        "registry_type": "npm",
        "identifier": "mcp-kling",
        "transport_type": "stdio",
        "env_vars": [
            {"name": "KLING_ACCESS_KEY", "required": True, "secret": True, "description": "Kling API access key"},
            {"name": "KLING_SECRET_KEY", "required": True, "secret": True, "description": "Kling API secret key"},
        ],
    },
    {
        "name": "ai.higgsfield/mcp",
        "description": "Higgsfield AI - AI video generation and editing. Create and manipulate videos using Higgsfield AI models.",
        "repository_url": "https://github.com/Higgsfield-AI/higgsfield-ai-mcp",
        "registry_type": "pypi",
        "identifier": "higgsfield-ai-mcp",
        "transport_type": "stdio",
        "env_vars": [
            {"name": "HF_API_KEY", "required": True, "secret": True, "description": "Higgsfield AI API key"},
            {"name": "HF_SECRET", "required": True, "secret": True, "description": "Higgsfield AI secret key"},
        ],
    },
]


def add_curated_servers():
    """Add curated servers to the database."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    added = 0
    skipped = 0
    
    for server in CURATED_SERVERS:
        name = server["name"]
        
        # Check if already exists
        cursor.execute("SELECT name FROM servers WHERE name = ?", (name,))
        if cursor.fetchone():
            print(f"  ⏭️  {name} - already exists")
            skipped += 1
            continue
        
        # Insert into servers table
        cursor.execute("""
            INSERT INTO servers (name, description, repository_url, extracted_at)
            VALUES (?, ?, ?, ?)
        """, (
            name,
            server.get("description", ""),
            server.get("repository_url", ""),
            datetime.now().isoformat()
        ))
        
        # Add package info if stdio
        if server.get("registry_type"):
            cursor.execute("""
                INSERT OR IGNORE INTO server_packages 
                (server_name, registry_type, identifier, transport_type)
                VALUES (?, ?, ?, ?)
            """, (
                name,
                server["registry_type"],
                server.get("identifier", ""),
                server.get("transport_type", "stdio"),
            ))
        
        # Add remote endpoint if HTTP
        if server.get("url"):
            cursor.execute("""
                INSERT OR IGNORE INTO server_remotes
                (server_name, transport_type, url)
                VALUES (?, ?, ?)
            """, (
                name,
                server.get("transport_type", "streamable-http"),
                server["url"],
            ))

        # Add environment variables if specified
        for env_var in server.get("env_vars", []):
            cursor.execute("""
                INSERT OR IGNORE INTO environment_variables
                (server_name, var_name, is_required, is_secret, description)
                VALUES (?, ?, ?, ?, ?)
            """, (
                name,
                env_var["name"],
                env_var.get("required", True),
                env_var.get("secret", True),
                env_var.get("description", ""),
            ))

        print(f"  ✅ {name} - added")
        added += 1
    
    conn.commit()
    conn.close()
    
    print(f"\n{'='*60}")
    print(f"Added: {added} servers")
    print(f"Skipped: {skipped} (already exist)")
    print(f"Total curated: {len(CURATED_SERVERS)}")


if __name__ == "__main__":
    print("🎯 Adding Curated MCP Servers")
    print("="*60)
    add_curated_servers()
