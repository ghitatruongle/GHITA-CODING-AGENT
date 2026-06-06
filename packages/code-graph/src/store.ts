// ==============================================================================
// GHITA CODING AGENT - Phase 13: SQLite Graph Store
// ==============================================================================
// Persistent storage adapter using better-sqlite3 for the code knowledge graph.
// Stores nodes, edges, and supports full-text search via FTS5.
// ==============================================================================

import Database from 'better-sqlite3';
import type { CodeNode, CodeEdge, GraphStore, SearchQuery, SearchResult } from './types.js';

/**
 * SQLite-backed persistent store for the code knowledge graph.
 */
export class SQLiteGraphStore implements GraphStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  // ---------------------------------------------------------------------------
  // Schema setup
  // ---------------------------------------------------------------------------

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        qualified_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        excerpt TEXT DEFAULT '',
        exported INTEGER DEFAULT 0,
        doc_comment TEXT,
        parameters TEXT,
        return_type TEXT,
        parent_id TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        indexed_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_file ON nodes(file_path);
      CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
      CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
      CREATE INDEX IF NOT EXISTS idx_nodes_qualified ON nodes(qualified_name);

      CREATE TABLE IF NOT EXISTS edges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        line INTEGER,
        UNIQUE(from_id, to_id, kind)
      );

      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON edges(to_id);
      CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
    `);

    // FTS5 for full-text search (if available)
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
          name, qualified_name, tags, excerpt,
          content='nodes', content_rowid='rowid',
          tokenize='unicode61'
        );
      `);
    } catch {
      // FTS5 not available — fallback to LIKE queries
    }
  }

  // ---------------------------------------------------------------------------
  // Write operations
  // ---------------------------------------------------------------------------

  upsertNodes(nodes: CodeNode[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO nodes
        (id, kind, name, qualified_name, file_path, start_line, end_line,
         excerpt, exported, doc_comment, parameters, return_type, parent_id, tags, indexed_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((items: CodeNode[]) => {
      for (const n of items) {
        stmt.run(
          n.id,
          n.kind,
          n.name,
          n.qualifiedName,
          n.filePath,
          n.startLine,
          n.endLine,
          n.excerpt,
          n.exported ? 1 : 0,
          n.docComment ?? null,
          n.parameters ? JSON.stringify(n.parameters) : null,
          n.returnType ?? null,
          n.parentId ?? null,
          JSON.stringify(n.tags),
          n.indexedAt,
        );
      }
    });

    tx(nodes);

    // Rebuild FTS index
    this.rebuildFTSIndex();
  }

  upsertEdges(edges: CodeEdge[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO edges (from_id, to_id, kind, weight, line)
      VALUES (?, ?, ?, ?, ?)
    `);

    const tx = this.db.transaction((items: CodeEdge[]) => {
      for (const e of items) {
        stmt.run(e.from, e.to, e.kind, e.weight, e.line ?? null);
      }
    });

    tx(edges);
  }

  removeFile(filePath: string): void {
    const tx = this.db.transaction(() => {
      // Get node IDs for this file
      const nodeIds = (this.db
        .prepare('SELECT id FROM nodes WHERE file_path = ?')
        .all(filePath) as Array<{ id: string }>)
        .map((r) => r.id);

      // Remove edges referencing these nodes
      const idSet = nodeIds.map(() => '?').join(',');
      if (nodeIds.length > 0) {
        this.db
          .prepare(`DELETE FROM edges WHERE from_id IN (${idSet}) OR to_id IN (${idSet})`)
          .run(...nodeIds);
      }

      // Remove nodes
      this.db.prepare('DELETE FROM nodes WHERE file_path = ?').run(filePath);
    });

    tx();
  }

  // ---------------------------------------------------------------------------
  // Read operations
  // ---------------------------------------------------------------------------

  loadNodes(): CodeNode[] {
    const rows = this.db.prepare('SELECT * FROM nodes').all() as NodeRow[];
    return rows.map(rowToNode);
  }

  loadEdges(): CodeEdge[] {
    const rows = this.db.prepare('SELECT * FROM edges').all() as EdgeRow[];
    return rows.map(rowToEdge);
  }

  search(query: SearchQuery): SearchResult[] {
    const pattern = query.pattern.toLowerCase().trim();
    if (!pattern) return [];

    const limit = query.limit ?? 50;
    const scope = query.scope ?? 'all';
    const minScore = query.minScore ?? 0;

    let sql: string;
    const params: (string | number)[] = [];

    // Try FTS5 first
    const hasFTS = this.hasFTS5();

    if (hasFTS && pattern.length > 1) {
      sql = `
        SELECT n.*, 1.0 as rank_score
        FROM nodes n
        JOIN nodes_fts fts ON n.rowid = fts.rowid
        WHERE nodes_fts MATCH ?
      `;
      // FTS5 query: add * for prefix matching
      const ftsQuery = pattern.replace(/[^a-zA-Z0-9_]/g, ' ').trim().split(/\s+/).map(w => `${w}*`).join(' ');
      params.push(ftsQuery);
    } else {
      sql = `
        SELECT n.*, 
          CASE 
            WHEN LOWER(name) = ? THEN 1.0
            WHEN LOWER(name) LIKE ? THEN 0.85
            WHEN LOWER(qualified_name) LIKE ? THEN 0.7
            WHEN LOWER(tags) LIKE ? THEN 0.5
            ELSE 0.3
          END as rank_score
        FROM nodes n
        WHERE LOWER(name) LIKE ?
           OR LOWER(qualified_name) LIKE ?
           OR LOWER(tags) LIKE ?
      `;
      const likePattern = `%${pattern}%`;
      params.push(pattern, likePattern, likePattern, likePattern, likePattern, likePattern, likePattern);
    }

    // Scope filter
    if (scope !== 'all') {
      sql += ' AND kind = ?';
      params.push(scope);
    }

    // File prefix filter
    if (query.filePrefix) {
      sql += ' AND file_path LIKE ?';
      params.push(`%${query.filePrefix}%`);
    }

    sql += ' ORDER BY rank_score DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as Array<NodeRow & { rank_score: number }>;

    const results: SearchResult[] = [];
    for (const row of rows) {
      const node = rowToNode(row);
      const score = Math.max(0, Math.min(1, row.rank_score));
      if (score < minScore) continue;

      // Find highlight positions
      const highlights: Array<[number, number]> = [];
      const nameLower = node.name.toLowerCase();
      const idx = nameLower.indexOf(pattern);
      if (idx >= 0) {
        highlights.push([idx, idx + pattern.length]);
      }

      results.push({
        node: query.includeExcerpt === false ? { ...node, excerpt: '' } : node,
        score,
        highlights,
      });
    }

    return results;
  }

  getNode(id: string): CodeNode | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined;
    return row ? rowToNode(row) : null;
  }

  getEdgesFrom(nodeId: string): CodeEdge[] {
    const rows = this.db.prepare('SELECT * FROM edges WHERE from_id = ?').all(nodeId) as EdgeRow[];
    return rows.map(rowToEdge);
  }

  getEdgesTo(nodeId: string): CodeEdge[] {
    const rows = this.db.prepare('SELECT * FROM edges WHERE to_id = ?').all(nodeId) as EdgeRow[];
    return rows.map(rowToEdge);
  }

  stats(): { nodes: number; edges: number; files: number } {
    const nodeCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM nodes').get() as { cnt: number }).cnt;
    const edgeCount = (this.db.prepare('SELECT COUNT(*) as cnt FROM edges').get() as { cnt: number }).cnt;
    const fileCount = (this.db.prepare('SELECT COUNT(DISTINCT file_path) as cnt FROM nodes').get() as { cnt: number }).cnt;
    return { nodes: nodeCount, edges: edgeCount, files: fileCount };
  }

  close(): void {
    this.db.close();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private hasFTS5(): boolean {
    try {
      this.db.prepare('SELECT 1 FROM nodes_fts LIMIT 0').get();
      return true;
    } catch {
      return false;
    }
  }

  private rebuildFTSIndex(): void {
    if (!this.hasFTS5()) return;
    try {
      this.db.exec('INSERT INTO nodes_fts(nodes_fts) VALUES("rebuild")');
    } catch {
      // Silently ignore FTS rebuild errors
    }
  }
}

// ---------------------------------------------------------------------------
// Row type helpers
// ---------------------------------------------------------------------------

interface NodeRow {
  id: string;
  kind: string;
  name: string;
  qualified_name: string;
  file_path: string;
  start_line: number;
  end_line: number;
  excerpt: string;
  exported: number;
  doc_comment: string | null;
  parameters: string | null;
  return_type: string | null;
  parent_id: string | null;
  tags: string;
  indexed_at: number;
}

interface EdgeRow {
  from_id: string;
  to_id: string;
  kind: string;
  weight: number;
  line: number | null;
}

function rowToNode(row: NodeRow): CodeNode {
  return {
    id: row.id,
    kind: row.kind as CodeNode['kind'],
    name: row.name,
    qualifiedName: row.qualified_name,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    excerpt: row.excerpt,
    exported: row.exported === 1,
    docComment: row.doc_comment ?? undefined,
    parameters: row.parameters ? JSON.parse(row.parameters) as string[] : undefined,
    returnType: row.return_type ?? undefined,
    parentId: row.parent_id ?? undefined,
    tags: JSON.parse(row.tags) as string[],
    indexedAt: row.indexed_at,
  };
}

function rowToEdge(row: EdgeRow): CodeEdge {
  return {
    from: row.from_id,
    to: row.to_id,
    kind: row.kind as CodeEdge['kind'],
    weight: row.weight,
    line: row.line ?? undefined,
  };
}
