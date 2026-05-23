# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

path = r'D:\GHITA CODING AGENT\Plan\Update 0.0.2 beta2.html'

# Read original file to extract content
with open(path, 'r', encoding='utf-8') as f:
    original = f.read()

# ============================================================
# REBUILD THE FILE WITH PROPER 2-SPACE INDENTATION
# ============================================================

# Use proper line-by-line generation with explicit indent tracking
# We'll use an indent stack to track proper nesting

lines = original.split('\n')

# Collect all non-empty content lines first
content_lines = []
for line in lines:
    stripped = line.strip()
    if stripped:
        content_lines.append(stripped)

# Now rebuild with proper indentation
result = []
indent_level = 0
in_style = False
in_code_block = False
tag_stack = []

def indent(n=None):
    return '  ' * (n if n is not None else indent_level)

for line in content_lines:
    stripped = line
    
    # Skip duplicate empty lines
    if not stripped:
        result.append('')
        continue
    
    # Track style blocks
    if stripped == '<style>':
        in_style = True
        result.append(indent() + stripped)
        indent_level += 1
        continue
    
    if stripped == '</style>':
        in_style = False
        indent_level -= 1
        result.append(indent() + stripped)
        continue
    
    if in_style:
        result.append(indent() + stripped)
        continue
    
    # Detect closing tags first
    is_closing = stripped.startswith('</') and not stripped.startswith('<!--')
    is_self_closing = stripped.endswith('/>') or stripped.startswith('<!') or stripped.startswith('<?')
    
    if is_closing:
        indent_level = max(0, indent_level - 1)
    
    # Write the line with proper indent
    result.append(indent() + stripped)
    
    # Track opening tags (not self-closing, not comments, not closing)
    if not is_closing and not is_self_closing and not stripped.startswith('<!--') and '<' in stripped and '>' in stripped:
        # Extract tag name
        import re
        tag_match = re.match(r'<(\w+)', stripped)
        if tag_match:
            tagname = tag_match.group(1).lower()
            void_tags = {'br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr', '!doctype'}
            if tagname not in void_tags:
                indent_level += 1

# Now join
new_content = '\n'.join(result)

# Clean up multiple blank lines
import re
new_content = re.sub(r'\n{3,}', '\n\n', new_content)

# Write back
with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Done! Rebuilt HTML successfully.")
print(f"Size: {len(new_content)} bytes, Lines: {len(new_content.splitlines())}")
print(f"First 5 lines:")
for l in new_content.split('\n')[:5]:
    print(l)
