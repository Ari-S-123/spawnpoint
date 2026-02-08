import { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import './index.css';

const WISP_URL = 'http://localhost:8000';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

const SAMPLE_MISSIONS = [
  {
    id: 'spacex',
    category: 'Starter',
    label: '🚀 SpaceX News',
    prompt: 'Find current news about SpaceX and tell me if they have any launches today.'
  },
  {
    id: 'crypto',
    category: 'Starter',
    label: '₿ Crypto Prices',
    prompt:
      'Get the current price of Bitcoin and Ethereum and tell me which one has performed better in the last 24 hours.'
  },
  {
    id: 'weather',
    category: 'Starter',
    label: '🌦️ Tokyo Weather',
    prompt: 'Find the weather in Tokyo for tomorrow and suggest three popular outdoor activities based on the forecast.'
  },
  {
    id: 'lib',
    category: 'Starter',
    label: '📦 Library Research',
    prompt: 'Research the latest version of the "sentence-transformers" library on GitHub and summarize what it does.'
  },

  {
    id: 'github_issues',
    category: 'GitHub',
    label: '🐙 Issue Triage',
    prompt: 'List all open issues in the "modelcontextprotocol/servers" repository and summarize the most recent one.'
  },
  {
    id: 'github_pr',
    category: 'GitHub',
    label: '🏗️ PR Review',
    prompt: 'Find the most recently merged pull request in "github/github-mcp-server" and tell me who authored it.'
  },

  {
    id: 'multimedia',
    category: 'Advanced',
    label: '🎙️ Creative Deck',
    prompt:
      'Convert the concept of "Autonomous Discovery Agents" into a 5-slide outline. Suggest stock imagery for each slide and a voiceover script for a 30-second presentation. Then create the audio and slides for it and give it to me.'
  },
  {
    id: 'research',
    category: 'Advanced',
    label: '🔍 Deep Research',
    prompt:
      'Find the most popular open-source library for Vector DBs on GitHub. Scrape its latest documentation overview and summarize the top 3 open issues.'
  },
  {
    id: 'fintech',
    category: 'Advanced',
    label: '📈 FinTech Scout',
    prompt:
      'Check the price of Solana (SOL). Find its historical price context from the web and search GitHub to see if there are any major recent repository updates or sentiment shifts.'
  },
  {
    id: 'sre',
    category: 'Advanced',
    label: '🛠️ Self-Healing SRE',
    prompt:
      'A production server is reported as slow. Search Wisp for diagnostic tools like "Sentry", "AWS Monitoring", or "CloudWatch" and explain how you would use them to find the root cause.'
  }
];

const today = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

function App() {
  const [intent, setIntent] = useState('Find current news about SpaceX and tell me if they have any launches today.');
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [debug, setDebug] = useState(false);
  const stopRequested = useRef(false);

  const addLog = (msg, type = 'info', data = null) => {
    console.log(`[Agent ${type.toUpperCase()}]`, msg, data || '');
    setLogs((prev) => [...prev, { msg, type, data, id: Math.random() }]);
  };

  const stopAgent = () => {
    addLog('🛑 Stop requested by user.', 'info');
    stopRequested.current = true;
  };

  const runAutonomousAgent = async () => {
    if (!GEMINI_API_KEY) {
      addLog('❌ Error: Missing VITE_GEMINI_API_KEY in .env file', 'error');
      return;
    }

    setRunning(true);
    setLogs([]);
    stopRequested.current = false;
    addLog(`🚀 Initializing Advanced Autonomous Loop...`);
    addLog(`Goal: "${intent}"`);

    try {
      const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      let context = [
        {
          role: 'user',
          parts: [
            {
              text: `You are an advanced autonomous discovery agent. Your goal is: "${intent}".
        
        CRITICAL CONTEXT: Today's date is ${today}. Use this as your absolute baseline for what is "today", "tomorrow", or "recent".
        
        You have NO internal tools. You must DISCOVER and USE tools using the Wisp Gateway.
        
        Available Wisp Endpoints:
        1. GET ${WISP_URL}/keys - See available API tokens in the gateway.
        2. GET ${WISP_URL}/search?query=<query> - Find technical tools by intent.
        3. GET ${WISP_URL}/servers/<server_name>/tools - List all tools for a specific server (e.g., "io.fusionauth/mcp-api").
        4. POST ${WISP_URL}/call - Execute a tool. (args: {server_name, tool_name, arguments})
        
        Agent Protocol:
        1. **Decompose**: Break the goal into actionable subtasks. Identify *all* required deliverables (text, code, images, audio, data).
        2. **Relentless Discovery**: For *every* subtask, you must SEARCH for a tool. Do not assume you can't do it until you check.
           - Need images? Search for "image generation" or "stock photos".
           - Need voice? Search for "text to speech".
           - Need data? Search for "web search" or specific APIs.
        3. **Drill Down**: If you find a promising server but need to see its capabilities, use ACTION: LIST_TOOLS.
        4. **Tool Execution**: Execute tools to generate ACTUAL results. 
           - **ANTI-LAZINESS RULE**: Do NOT say "I suggest using..." or "You can use...". You must use the tool yourself and provide the result.
           - If a tool fails, try to fix the call. The API key may be insufficient for certain calls, so try a different tool from the server if needed. Or try a different search query or a different tool. 
           - For instance ElevenLabs may require a paid plan for voice design vs TTS with a known voice id (search_voices)
        5. **Tool Search Rules**: 
           - **ATOMIC SEARCHES**: Search for ONE capability at a time using simple, descriptive terms.
           - **BAD**: "image generation freepik openai web search tavily" (Keyword stuffing is confusing)
           - **GOOD**: "image generation" (then evaluate results), THEN "web search", THEN "text to speech".
           - **Do NOT** include specific tool names (like "freepik" or "gemini") in the query unless you are purposely filtering for them. Focus on the *capability* (e.g., "image generation").
        6. **Verify Completeness**: Before providing the final answer, check: "Did I generate the actual media/data requested, or just text?" 
           - If you missed a deliverable (like an image), go back and search for a tool to create it.
        7. **Final Answer**: Only provide the "FINAL ANSWER:" when ALL parts of the goal are actually completed with tool outputs.
        
        Available Actions:
        - "ACTION: KEYS" - check permissions.
        - "ACTION: SEARCH" <query> - find tools. (e.g. ACTION: SEARCH space news tool)
        - "ACTION: LIST_TOOLS" <server_name> - list tools for a server. (e.g. ACTION: LIST_TOOLS io.fusionauth/mcp-api)
        - "ACTION: CALL" <JSON> - run a tool.
        - "FINAL ANSWER:" <text> - the mission is complete.
        
        STRICT RULES:
        - Always explain your reasoning and current subtask before taking an action.
        - NEVER output markers like "user:", "model:", "Note:", or "Reasoning:". Just provide your natural language thoughts.
        - Do not hallucinate or simulate tool outputs. Wait for the user to provide the actual Gateway response.`
            }
          ]
        }
      ];

      let iterations = 0;
      const MAX_ITERATIONS = 100;

      while (iterations < MAX_ITERATIONS) {
        if (stopRequested.current) {
          addLog('✋ Agent stopped by user.', 'info');
          break;
        }
        iterations++;
        addLog(`🧠 Thinking (Step ${iterations})...`);

        const response = await genAI.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: context
        });

        const responseText = typeof response.text === 'function' ? response.text() : response.text;

        if (!responseText) {
          addLog('⚠️ Warning: Received empty response from Gemini.', 'error');
          context.push({
            role: 'user',
            parts: [{ text: 'Your previous response was empty. Please try again or provide a final answer.' }]
          });
          continue;
        }

        addLog(responseText, 'thought');
        context.push({ role: 'model', parts: [{ text: responseText }] });

        if (responseText.includes('FINAL ANSWER:')) {
          addLog('🏁 Mission Accomplished!', 'success');
          break;
        }

        if (responseText.includes('ACTION: KEYS')) {
          addLog('🔑 Checking Gateway permissions...');
          const resp = await fetch(`${WISP_URL}/keys`);
          const data = await resp.json();
          addLog(`Keys found: ${(data.available_keys || []).join(', ')}`);
          context.push({ role: 'user', parts: [{ text: `GATEWAY KEYS RESULT: ${JSON.stringify(data)}` }] });
        } else if (responseText.includes('ACTION: SEARCH')) {
          let searchQuery = responseText.split('ACTION: SEARCH')[1].trim().split('\n')[0];
          // Basic frontend sanitization: remove common non-alphanumeric chars that break FTS5
          searchQuery = searchQuery.replace(/[*#`_\\-]/g, ' ').trim();

          addLog(`🔍 Searching Wisp for capability: "${searchQuery}"`);
          try {
            const resp = await fetch(`${WISP_URL}/search?query=${encodeURIComponent(searchQuery)}&limit=3`);
            if (!resp.ok) {
              const errText = await resp.text();
              throw new Error(`Example Agent HTTP Error ${resp.status}: ${errText}`);
            }
            const data = await resp.json();

            if (data && data.results) {
              addLog(`Wisp found ${data.results.length} potential tools.`);
              context.push({ role: 'user', parts: [{ text: `WISP SEARCH RESULT: ${JSON.stringify(data.results)}` }] });
            } else {
              const errorMsg = data.detail || 'Unknown error occurred during search.';
              addLog(`❌ Search failed: ${errorMsg}`, 'error');
              context.push({ role: 'user', parts: [{ text: `WISP SEARCH ERROR: ${errorMsg}` }] });
            }
          } catch (e) {
            addLog(`❌ Network/Search Error: ${e.message}`, 'error');
            context.push({ role: 'user', parts: [{ text: `NETWORK ERROR: ${e.message}` }] });
          }
        } else if (responseText.includes('ACTION: LIST_TOOLS')) {
          let serverName = responseText.split('ACTION: LIST_TOOLS')[1].trim().split('\n')[0];
          addLog(`📋 Listing tools for server: "${serverName}"`);

          try {
            const resp = await fetch(`${WISP_URL}/servers/${encodeURIComponent(serverName)}/tools`);
            if (resp.ok) {
              const data = await resp.json();
              addLog(`Found ${data.tools.length} tools for ${serverName}.`);
              context.push({ role: 'user', parts: [{ text: `SERVER TOOLS RESULT: ${JSON.stringify(data.tools)}` }] });
            } else {
              const errorText = await resp.text();
              addLog(`❌ Failed to list tools: ${errorText}`, 'error');
              context.push({ role: 'user', parts: [{ text: `ERROR LISTING TOOLS: ${errorText}` }] });
            }
          } catch (e) {
            addLog(`❌ Network error listing tools: ${e.message}`, 'error');
            context.push({ role: 'user', parts: [{ text: `NETWORK ERROR: ${e.message}` }] });
          }
        } else if (responseText.includes('ACTION: CALL')) {
          const jsonStr = responseText.split('ACTION: CALL')[1].trim();
          try {
            const callData = JSON.parse(jsonStr.substring(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1));
            addLog(`⚡ Calling ${callData.tool_name}...`);

            const resp = await fetch(`${WISP_URL}/call`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(callData)
            });

            if (!resp.ok) {
              const errText = await resp.text();
              addLog(`❌ Execution failed (HTTP ${resp.status}): ${errText}`, 'error');
              context.push({
                role: 'user',
                parts: [{ text: `TOOL EXECUTION ERROR (HTTP ${resp.status}): ${errText}` }]
              });
              continue;
            }

            const resultData = await resp.json();
            addLog('Result received.', 'success');
            if (debug) {
              addLog('Debug Tool Output:', 'result', resultData);
            }
            context.push({ role: 'user', parts: [{ text: `TOOL EXECUTION RESULT: ${JSON.stringify(resultData)}` }] });
          } catch (e) {
            addLog(`Failed to parse or call tool: ${e.message}`, 'error');
            context.push({ role: 'user', parts: [{ text: `ERROR: ${e.message}. Please fix your JSON.` }] });
          }
        } else {
          addLog('⚠️ No action detected. Prompting to continue...', 'info');
          context.push({
            role: 'user',
            parts: [
              {
                text: 'I did not detect a valid ACTION command (KEYS, SEARCH, LIST_TOOLS, CALL) or FINAL ANSWER. Please proceed with the next step using a valid ACTION.'
              }
            ]
          });
        }
      }

      if (iterations >= MAX_ITERATIONS) {
        addLog('Max iterations reached. Ending session.', 'error');
      }
    } catch (err) {
      addLog(`❌ Fatal System Error: ${err.message}`, 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="agent-container">
      <header>
        <div className="status-dot"></div>
        <h1>Wisp Advanced Agent</h1>
        <div className="controls">
          <label className="debug-toggle">
            <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
            Debug Mode
          </label>
        </div>
      </header>

      <main>
        <div className="intent-box">
          <label>Starter Missions</label>
          <div className="mission-chips">
            {SAMPLE_MISSIONS.filter((m) => m.category === 'Starter').map((m) => (
              <button key={m.id} className="mission-chip" onClick={() => setIntent(m.prompt)} disabled={running}>
                {m.label}
              </button>
            ))}
          </div>

          <label>Advanced Inspo (Multi-Step)</label>
          <div className="mission-chips">
            {SAMPLE_MISSIONS.filter((m) => m.category === 'Advanced').map((m) => (
              <button
                key={m.id}
                className="mission-chip advanced"
                onClick={() => setIntent(m.prompt)}
                disabled={running}
              >
                {m.label}
              </button>
            ))}
          </div>

          <label>High-Level Goal</label>
          <input
            type="text"
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            disabled={running}
            placeholder="What should I do?"
          />
          <button onClick={runAutonomousAgent} disabled={running}>
            {running ? 'Agent Thinking...' : 'Start Autonomous Mission'}
          </button>
          {running && (
            <button className="stop-btn" onClick={stopAgent}>
              Stop
            </button>
          )}
        </div>

        <div className="terminal">
          {logs.map((log) => (
            <div key={log.id} className={`log-entry ${log.type}`}>
              {log.type === 'thought' ? (
                <div className="thought-bubble">
                  <strong>Agent reasoning</strong>
                  <p>{log.msg}</p>
                </div>
              ) : log.type === 'result' ? (
                <div className="debug-output">
                  <strong>[DEBUG] Tool Output:</strong>
                  <pre>{JSON.stringify(log.data, null, 2)}</pre>
                </div>
              ) : (
                <span>{log.msg}</span>
              )}
            </div>
          ))}
          {!running && logs.length === 0 && <div className="idle-msg">Enter a mission goal to begin...</div>}
        </div>
      </main>

      <footer>Wisp Gateway v0.2 | AI: Gemini 3 flash</footer>
    </div>
  );
}

export default App;
