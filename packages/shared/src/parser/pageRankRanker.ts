import type { SymbolTag } from './polyglotTags.js';

export interface FileTags {
  filePath: string;
  tags: SymbolTag[];
}

export class PageRankRanker {
  
  public rankSymbols(
    files: FileTags[],
    damping = 0.85,
    maxIterations = 20,
    tolerance = 1e-6,
  ): Record<string, number> {
    const definedSymbols: Map<string, { file: string; tag: SymbolTag }> = new Map();
    const symbolMapByName: Map<string, string[]> = new Map(); // name -> list of symbolKey

    for (const file of files) {
      for (const tag of file.tags) {
        if (tag.kind === 'definition') {
          const key = `${file.filePath}#${tag.name}`;
          definedSymbols.set(key, { file: file.filePath, tag });

          if (!symbolMapByName.has(tag.name)) {
            symbolMapByName.set(tag.name, []);
          }
          const nameEntries = symbolMapByName.get(tag.name);
          if (nameEntries) nameEntries.push(key);
        }
      }
    }

    const nodes = Array.from(definedSymbols.keys());
    const N = nodes.length;
    if (N === 0) return {};

    const outEdges: Map<string, Set<string>> = new Map();
    const inEdges: Map<string, Set<string>> = new Map();

    for (const node of nodes) {
      outEdges.set(node, new Set());
      inEdges.set(node, new Set());
    }

    for (const file of files) {
      const definitions = file.tags.filter((t) => t.kind === 'definition');
      const references = file.tags.filter((t) => t.kind === 'reference');

      for (const ref of references) {
        const targetKeys = symbolMapByName.get(ref.name);
        if (!targetKeys || targetKeys.length === 0) continue;

        let sourceKey: string | null = null;
        for (const def of definitions) {
          if (ref.startLine >= def.startLine && ref.endLine <= def.endLine) {
            
            if (!sourceKey) {
              sourceKey = `${file.filePath}#${def.name}`;
            } else {
              const currentDefEntry = definedSymbols.get(sourceKey);
              if (
                currentDefEntry &&
                def.endLine - def.startLine <
                  currentDefEntry.tag.endLine - currentDefEntry.tag.startLine
              ) {
                sourceKey = `${file.filePath}#${def.name}`;
              }
            }
          }
        }

        if (!sourceKey) continue;

        for (const targetKey of targetKeys) {
          
          if (sourceKey === targetKey) continue;

          const outNeighbors = outEdges.get(sourceKey);
          const inNeighbors = inEdges.get(targetKey);
          if (outNeighbors) outNeighbors.add(targetKey);
          if (inNeighbors) inNeighbors.add(sourceKey);
        }
      }
    }

    let scores: Record<string, number> = {};
    const initScore = 1 / N;
    for (const node of nodes) {
      scores[node] = initScore;
    }

    const baseConstant = (1 - damping) / N;

    for (let iter = 0; iter < maxIterations; iter++) {
      const nextScores: Record<string, number> = {};
      let sinkContribution = 0;

      for (const node of nodes) {
        const outEdgesForNode = outEdges.get(node);
        if (outEdgesForNode && outEdgesForNode.size === 0) {
          sinkContribution += scores[node] || 0;
        }
      }
      const sinkShare = (damping * sinkContribution) / N;

      let diff = 0;
      for (const node of nodes) {
        let rankSum = 0;
        const parents = inEdges.get(node);
        if (!parents) continue;

        for (const parent of parents) {
          const parentOutEdges = outEdges.get(parent);
          const outDegree = parentOutEdges?.size ?? 1;
          rankSum += (scores[parent] || 0) / outDegree;
        }

        nextScores[node] = baseConstant + damping * rankSum + sinkShare;
        diff += Math.abs((nextScores[node] || 0) - (scores[node] || 0));
      }

      scores = nextScores;

      if (diff < tolerance) {
        break;
      }
    }

    return scores;
  }
}
