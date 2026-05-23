# -*- coding: utf-8 -*-
import sys, re
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

path = r'D:\GHITA CODING AGENT\Plan\Update 0.0.2 beta2.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Strip ALL leading whitespace from every line first
lines = content.split('\n')
stripped = [l.lstrip() for l in lines]

# Tags that affect nesting (only when they appear at the START of a line)
# Not <td>, <th>, <span>, <code>, <strong>, etc.
OPENER_TAGS = {'div', 'section', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'ul', 'ol', 'li',
               'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'pre', 'blockquote',
               'header', 'footer', 'nav', 'main', 'article', 'aside', 'form', 'fieldset'}
VOID_TAGS = {'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'}

result = []
stack = []
in_style = False

for line in stripped:
    if not line:
        result.append('')
        continue
    
    # Handle style block
    if line == '<style>' or line.startswith('<style '):
        in_style = True
        result.append('  ' * len(stack) + line)
        stack.append('style')
        continue
    if line == '</style>':
        in_style = False
        if stack and stack[-1] == 'style':
            stack.pop()
        result.append('  ' * len(stack) + line)
        continue
    if in_style:
        result.append('  ' * len(stack) + line)
        continue
    
    # Check if line starts with a closing tag (innermost)
    closing_match = re.match(r'</(\w+)', line)
    opening_match = re.match(r'<(\w+)', line)
    
    if closing_match:
        tag = closing_match.group(1).lower()
        # Pop all matching tags from the stack
        if tag in OPENER_TAGS:
            # Find and remove the matching opening tag
            found = False
            for i in range(len(stack) - 1, -1, -1):
                if stack[i] == tag:
                    stack.pop(i)
                    found = True
                    break
        result.append('  ' * len(stack) + line)
    
    elif opening_match:
        tag = opening_match.group(1).lower()
        # Check if it's a block-level opener
        is_self_closing = line.endswith('/>') or tag in VOID_TAGS or line.startswith('<!') or tag == '!doctype'
        
        if tag in OPENER_TAGS and not is_self_closing:
            result.append('  ' * len(stack) + line)
            stack.append(tag)
        else:
            # Inline, comment, or self-closing tag - just indent at current level
            result.append('  ' * len(stack) + line)
    
    else:
        # Plain text or content
        result.append('  ' * len(stack) + line)

content = '\n'.join(result)

# Clean up excessive blank lines
content = re.sub(r'\n{4,}', '\n\n\n', content)

# Write back
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Done! Size: {len(content)} bytes, Lines: {len(content.splitlines())}")
