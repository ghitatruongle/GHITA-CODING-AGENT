import sys, re, os

path = 'D:/GHITA CODING AGENT/Plan/Update 0.0.2 beta2.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix: look for 3 </div> tags in a row before MUC 3
# Pattern: 3 closing divs with optional whitespace between them, then MUC 3
pattern = r'(</div>\s*</div>\s*</div>\s*<!-- ====== MUC 3)'
matches = re.findall(pattern, content, re.DOTALL)
print(f'Found {len(matches)} triple-</div> pattern(s) before MUC 3')

# Replace triple </div> with double </div> (feat-grid close + section close)
content = re.sub(pattern, r'</div>\n</div>\n            <!-- ====== MUC 3', content)

# Also check for the overall div balance
open_divs = len(re.findall(r'<div\s', content))
close_divs = content.count('</div>')
print(f'Open <div tags: {open_divs}')
print(f'Close </div> tags: {close_divs}')
if open_divs == close_divs:
    print('DIV BALANCE: OK - all divs are properly closed')
else:
    diff = open_divs - close_divs
    print(f'DIV BALANCE: MISMATCH - {abs(diff)} more {"opens" if diff > 0 else "closes"}')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('File saved successfully!')
