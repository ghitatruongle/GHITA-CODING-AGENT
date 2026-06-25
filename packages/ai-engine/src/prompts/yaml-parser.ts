// ==============================================================================
// GHITA CODING AGENT - Custom, Zero-Dependency YAML Parser
// ==============================================================================

interface YamlTreeNode {
  indent: number;
  isListItem: boolean;
  key?: string;
  value?: string;
  children: YamlTreeNode[];
}

function parseNodeValue(valStr?: string): unknown {
  if (valStr === undefined || valStr === null) return undefined;
  const v = valStr.trim();
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (!isNaN(Number(v))) return Number(v);

  // Remove enclosing quotes if any
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.substring(1, v.length - 1);
  }
  return v;
}

function buildTree(lines: string[]): YamlTreeNode[] {
  const root: YamlTreeNode = { indent: -1, isListItem: false, children: [] };
  const stack: YamlTreeNode[] = [root];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine === undefined) {
      continue;
    }
    const trimmed = rawLine.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const indent = rawLine.search(/\S/);

    // Determine if list item
    let isListItem = false;
    let text = trimmed;
    if (trimmed.startsWith('-')) {
      isListItem = true;
      text = trimmed.substring(1).trim();
    }

    // Determine key and value
    let key: string | undefined;
    let value: string | undefined = text;

    // Match "key: value" or "key:"
    const colonSpaceMatch = text.match(/^("([^"]+)"|'([^']+)'|([^:]+)):\s*(.*)$/);
    if (colonSpaceMatch) {
      key = (colonSpaceMatch[2] || colonSpaceMatch[3] || colonSpaceMatch[4] || '').trim();
      value = (colonSpaceMatch[5] || '').trim();
    }

    const node: YamlTreeNode = {
      indent,
      isListItem,
      key,
      value,
      children: [],
    };

    // Pop stack until parent indent is smaller than current indent
    while (stack.length > 1) {
      const top = stack[stack.length - 1];
      if (top && top.indent >= indent) {
        stack.pop();
      } else {
        break;
      }
    }

    stack[stack.length - 1]?.children.push(node);

    // Consume block scalar
    if (value === '|' || value === '>') {
      const mode = value;
      const blockLines: string[] = [];
      let literalIndent = -1;
      i++; // move to next line
      while (i < lines.length) {
        const nextRawLine = lines[i];
        if (nextRawLine === undefined) {
          break;
        }
        const isEmpty = nextRawLine.trim() === '';
        if (isEmpty) {
          blockLines.push('');
          i++;
          continue;
        }
        const lineIndent = nextRawLine.search(/\S/);
        if (lineIndent <= indent) {
          i--; // backtrack
          break;
        }
        if (literalIndent === -1) {
          literalIndent = lineIndent;
        }
        blockLines.push(nextRawLine.substring(literalIndent));
        i++;
      }

      let blockContent = '';
      if (mode === '|') {
        blockContent = blockLines.join('\n');
      } else {
        for (let j = 0; j < blockLines.length; j++) {
          const cur = blockLines[j];
          if (cur === '') {
            blockContent += '\n';
          } else {
            if (j > 0 && blockLines[j - 1] !== '') {
              blockContent += ' ';
            }
            blockContent += cur;
          }
        }
      }
      node.value = blockContent;
    } else {
      stack.push(node);
    }
  }

  return root.children;
}

function convertTree(nodes: YamlTreeNode[]): unknown {
  if (nodes.length === 0) return undefined;

  const firstNode = nodes[0];
  if (firstNode && firstNode.isListItem) {
    const list: unknown[] = [];
    for (const node of nodes) {
      if (node.key !== undefined) {
        const itemObj: Record<string, unknown> = {};
        if (node.value !== undefined && node.value !== '') {
          itemObj[node.key] = parseNodeValue(node.value);
          if (node.children.length > 0) {
            const childrenVal = convertTree(node.children);
            if (childrenVal && typeof childrenVal === 'object' && !Array.isArray(childrenVal)) {
              Object.assign(itemObj, childrenVal);
            }
          }
        } else {
          itemObj[node.key] = node.children.length > 0 ? convertTree(node.children) : null;
        }
        list.push(itemObj);
      } else {
        if (node.children.length > 0) {
          list.push(convertTree(node.children));
        } else {
          list.push(parseNodeValue(node.value));
        }
      }
    }
    return list;
  }

  const obj: Record<string, unknown> = {};
  for (const node of nodes) {
    if (node.key !== undefined) {
      if (node.children.length > 0) {
        obj[node.key] = convertTree(node.children);
      } else {
        obj[node.key] = parseNodeValue(node.value);
      }
    } else {
      if (node.value !== undefined) {
        return parseNodeValue(node.value);
      }
    }
  }
  return obj;
}

export function parseYaml(yamlStr: string): unknown {
  const lines = yamlStr.split(/\r?\n/);
  const tree = buildTree(lines);
  return convertTree(tree);
}
