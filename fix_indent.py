# -*- coding: utf-8 -*-
import sys, re
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

path = r'D:\GHITA CODING AGENT\Plan\Update 0.0.2 beta2.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
fixed = []

# Fix root-level closing tags that have too much indent
for line in lines:
    s = line.strip()
    leading = len(line) - len(line.lstrip())
    
    # Fix root-level closing tags
    if s == '</html>' or s == '</body>' or s == '<!DOCTYPE html>':
        fixed.append(s)
    elif s == '</div>' and leading >= 10:
        # Could be container closing
        fixed.append('</div>')
    else:
        fixed.append(line)

content = '\n'.join(fixed)

# Also normalize: make sure there's at least one blank line between major sections
# but not too many blank lines
content = re.sub(r'\n{4,}', '\n\n\n', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Final size: {len(content)} bytes, Lines: {len(content.splitlines())}")
