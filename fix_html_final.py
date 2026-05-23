import re

path = 'D:/GHITA CODING AGENT/Plan/Update 0.0.2 beta2.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

open_divs = len(re.findall(r'<div\s', content))
close_divs = content.count('</div>')
print(f'Before: Opens={open_divs}, Closes={close_divs}, Diff={close_divs - open_divs}')

# Fix 1: After LangChain section feat-grid, remove extra </div>
# Pattern: feat-item close \n feat-grid close \n EXTRA \n blank \n <!-- 2.3
pattern1 = r'(Extensive testing utilities</div>\n\s*</div>\n)\s*</div>\n(\s*<!-- 2\.3 L)'
count1 = len(re.findall(pattern1, content))
print(f'Fix 1 matches: {count1}')
content = re.sub(pattern1, r'\1\2', content)

# Fix 2: Before MUC 3, look for </div>\n</div>\n</div> and reduce by one
pattern2 = r'(</div>\s*</div>\s*</div>\s*<!-- ====== MUC 3)'
count2 = len(re.findall(pattern2, content))
print(f'Fix 2 matches: {count2}')
content = re.sub(pattern2, r'</div>\n</div>\n            <!-- ====== MUC 3', content)

# Fix 3: Look for any remaining triple </div> patterns with whitespace
pattern3 = r'(</div>\s*</div>\s*</div>)'
count3 = len(re.findall(pattern3, content))
print(f'Remaining triple-</div> patterns: {count3}')

# Fix 4: Check end of file for trailing extra </div>
# Look at last 50 chars
print(f'Last 80 chars: {repr(content[-80:])}')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
open_divs2 = len(re.findall(r'<div\s', content))
close_divs2 = content.count('</div>')
print(f'After: Opens={open_divs2}, Closes={close_divs2}, Diff={close_divs2 - open_divs2}')

# Now try to run prettier to validate
import subprocess
result = subprocess.run(['npx', 'prettier', path, '--check'], 
                       capture_output=True, text=True, timeout=10)
print(f'Prettier check: {result.returncode}')
if result.returncode != 0:
    print(f'Error: {result.stderr[:500]}')
