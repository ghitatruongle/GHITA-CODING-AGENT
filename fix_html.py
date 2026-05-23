import sys

path = 'D:/GHITA CODING AGENT/Plan/Update 0.0.2 beta2.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: After 2.2 LangChain's feat-grid, remove one extra </div>
# Pattern: feat-grid closes, then there's an extra </div> that prematurely closes MUC 2 section
old1 = '</div>\n</div>\n\n            <!-- 2.3 LiteLLM -->'
new1 = '</div>\n\n            <!-- 2.3 LiteLLM -->'

count1 = content.count(old1)
print(f'Fix 1: Found {count1} occurrence(s)')
if count1 > 0:
    content = content.replace(old1, new1, 1)
    print('Fix 1 applied')

# Fix 2: After 2.4 CrewAI's feat-grid, there may be an extra </div>
# We need to close MUC 2 section properly, so keep 2 </div> (feat-grid + section), remove any extra
import re

# Find the area around MUC 3
idx = content.find('MUC 3')
if idx >= 0:
    chunk = content[idx-200:idx]
    # Count how many </div> are in this chunk
    div_count = chunk.count('</div>')
    print(f'Before MUC 3, found {div_count} </div> tags in the preceding 200 chars')
    # Show what's there
    print(repr(chunk[-100:]))
    
    # The desired structure is: ... feat-grid closes, section closes, then "<!-- === MUC 3 ..."
    # Let's look for the pattern at the boundary
    boundary_pattern = '</div>\n</div>\n            <!-- ====== MUC 3'
    count2 = content.count(boundary_pattern)
    print(f'Fix 2: Found {count2} correct boundary patterns')
    print()

# Also check what the file looks like at the end
print('=== Last 100 chars of file ===')
print(repr(content[-100:]))

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('\nFile written successfully')
