import { useState, useEffect } from 'react';
import './App.css';

const EXAMPLES = [
  'weather forecast',
  'github repositories',
  'search documentation',
  'ios simulator',
  'deploy to docker'
];

function ToolCard({ tool }) {
  const [executing, setExecuting] = useState(false);
  const [args, setArgs] = useState('{}');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showCall, setShowCall] = useState(false);

  const handleCall = async () => {
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      const parsedArgs = JSON.parse(args);
      const resp = await fetch('http://localhost:8000/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_name: tool.server.name,
          tool_name: tool.name,
          arguments: parsedArgs
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Execution failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className={`tool-card ${showCall ? 'expanded' : ''}`}>
      <div className="tool-header">
        <span className="tool-name">{tool.name}</span>
        <span className="relevance-badge">{Math.round(tool.relevance * 100)}% match</span>
      </div>

      <p className="tool-desc">{tool.description || 'No description provided.'}</p>

      <div className="server-info">
        <span style={{ color: '#8b949e' }}>Server </span>
        <span className="server-name">{tool.server.name}</span>
      </div>

      <div className="tool-actions">
        <button className="action-btn" onClick={() => setShowCall(!showCall)}>
          {showCall ? 'Hide Call' : 'Call Tool'}
        </button>
      </div>

      {showCall && (
        <div className="execution-panel">
          <div className="schema-info">
            <strong>Parameters:</strong>
            <pre>{JSON.stringify(tool.input_schema?.properties || {}, null, 2)}</pre>
          </div>

          <div className="arg-input">
            <label>Arguments (JSON):</label>
            <textarea value={args} onChange={(e) => setArgs(e.target.value)} placeholder='{"param": "value"}' />
          </div>

          <button
            className="search-btn"
            onClick={handleCall}
            disabled={executing}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {executing ? 'Executing...' : 'Run Tool'}
          </button>

          {error && <div className="exec-error">{error}</div>}
          {result && (
            <div className="exec-result">
              <strong>Result:</strong>
              <pre>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      <div className="security-badges">{tool.requires_auth && <span title="Requires Auth">🔐</span>}</div>
    </div>
  );
}

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const resp = await fetch(`http://localhost:8000/search?query=${encodeURIComponent(query)}&limit=10`);
      if (!resp.ok) throw new Error('Failed to fetch results');
      const data = await resp.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExampleClick = (q) => {
    setQuery(q);
  };

  useEffect(() => {
    if (query && !searched && EXAMPLES.includes(query)) {
      handleSearch();
    }
  }, [query]);

  return (
    <div className="app">
      <div className="search-container">
        <h1>Wisp</h1>
        <p style={{ color: '#8b949e', marginBottom: '2rem' }}>Discover and execute MCP tools</p>

        <form onSubmit={handleSearch} className="search-input-wrapper">
          <input
            type="text"
            placeholder="Search for tools or functionality..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (searched) setSearched(false);
            }}
          />
          <button type="submit" className="search-btn">
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div className="example-queries">
          {EXAMPLES.map((ex) => (
            <span key={ex} className="query-chip" onClick={() => handleExampleClick(ex)}>
              {ex}
            </span>
          ))}
        </div>
      </div>

      <div className="results-area">
        {loading && <div className="loading-spinner"></div>}

        {error && <div className="error-msg">Error: {error}</div>}

        {!loading && !error && searched && results.length === 0 && (
          <div className="empty-state">
            <p>No tools found matching "{query}"</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="results-grid">
            {results.map((tool) => (
              <ToolCard key={`${tool.server.name}-${tool.name}`} tool={tool} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
