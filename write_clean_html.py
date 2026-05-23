# -*- coding: utf-8 -*-
import sys
sys.stdout.reconfigure(encoding='utf-8') if hasattr(sys.stdout, 'reconfigure') else None

path = r'D:\GHITA CODING AGENT\Plan\Update 0.0.2 beta2.html'

# Read original to get all content
with open(path, 'r', encoding='utf-8') as f:
    original = f.read()

# NEW APPROACH: Preserve all content but fix only the structural issue
# and normalize indentation to 2-space steps.

# First, restore the content by replacing the messed up indentation
# The main issue is:
# 1. Sections 2.2-2.4 need to be inside MUC 2's section div
# 2. Everything should use consistent 2-space indentation

# Extract all non-empty text content preserving structure
import re

# Detect the worst issues: lines with excessive leading whitespace
# Fix: reduce any indentation > 40 spaces down to reasonable levels
def fix_line(line):
    stripped = line.lstrip()
    leading = len(line) - len(stripped)
    
    # If line has excessive indentation (> 40 spaces), reduce it
    if leading > 40:
        # Calculate reasonable indent based on content
        if stripped.startswith('</') and not stripped.startswith('<!--'):
            return '  ' * 8 + stripped
        elif stripped.startswith('<!--'):
            return '  ' * 8 + stripped
        else:
            return '  ' * 10 + stripped
    
    return line

lines = original.split('\n')
fixed = []
for l in lines:
    fixed.append(fix_line(l))

content = '\n'.join(fixed)

# Now fix the structural issue:
# Move sections 2.2-2.4 inside MUC 2's section div

# The MUC 2 section currently closes with </div> right after Vercel content.
# We need to find that premature </div> and remove it,
# then only close MUC 2 section after section 2.4 ends.

# Pattern: premature closing of MUC 2 section before section 2.2
# Look for: </div>\n\n  <!-- 2.2 LangChain.js -->
old = '</div>\n\n  <!-- 2.2 LangChain.js -->'
new = '\n  <!-- 2.2 LangChain.js -->'
content = content.replace(old, new, 1)

# Now add </div> before MUC 3 section (to close MUC 2 properly)
old = '<!-- ====== MUC 3: KE HOACH & HUONG DAN ====== -->'
new = '</div>\n\n<!-- ====== MUC 3: KE HOACH & HUONG DAN ====== -->'
content = content.replace(old, new, 1)

# Fix indentation of sections 2.2-2.4 content to be consistent
# These lines should have 2-space base indent (inside section div)
# Currently they have varying indents

lines = content.split('\n')
result = []
in_muc2_sub = False
muc2_section_started = False

for i, line in enumerate(lines):
    stripped = line.strip()
    
    # Detect MUC 2 section opening
    if 'MUC 2' in line and 'NGHIEN CUU' in line and '<div class="section">' in line:
        muc2_section_started = True
        result.append(line)
        continue
    
    # Detect sections 2.2-2.4 inside MUC 2
    if muc2_section_started and ('<!-- 2.2' in line or '<!-- 2.3' in line or '<!-- 2.4' in line):
        in_muc2_sub = True
        # Add proper indent: 2 spaces for h3 level elements
        result.append('  ' + stripped)
        continue
    
    # Detect when we exit MUC 2
    if '<!-- ====== MUC 3:' in line:
        muc2_section_started = False
        in_muc2_sub = False
        result.append(line)
        continue
    
    if in_muc2_sub and muc2_section_started:
        if stripped:
            # Inside section, inside subsection - 2 space base indent
            result.append('  ' + stripped)
        else:
            result.append('')
    elif stripped == '</div>' and 'MUC 3' in (result[-1] if result else ''):
        # Closing div for MUC 2 section
        result.append('</div>')
    else:
        result.append(line)

content = '\n'.join(result)

# Now do a final pass to normalize all indentation to 2-space steps
# but respecting the nesting structure

# Simple heuristic: reduce any indentation > 20 spaces
lines = content.split('\n')
result = []
for line in lines:
    stripped = line.strip()
    leading = len(line) - len(stripped)
    
    if leading > 20 and stripped:
        # Check context: lines that are deeply inside tables
        # Want max 20-space indent
        new_leading = min(leading, 20)
        result.append(' ' * new_leading + stripped)
    else:
        result.append(line)

content = '\n'.join(result)

# Remove excessive blank lines (more than 2 consecutive)
content = re.sub(r'\n{4,}', '\n\n\n', content)

# Write back
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Done! Rebuilt HTML.")
print(f"Size: {len(content)} bytes, Lines: {len(content.splitlines())}")

# Quick verification
sample = content[:500]
print("---SAMPLE---")
print(sample)
