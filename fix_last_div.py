import re

path = 'D:/GHITA CODING AGENT/Plan/Update 0.0.2 beta2.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Let's find areas where we have multiple </div> close together
# Split the file into sections at each <div class="section" (the main sections)
sections = re.split(r'(<!-- ====== MUC \d)', content)

# Count open/close divs per section
current_section = "HEADER"
section_opens = {}
section_closes = {}

for part in sections:
    if part.startswith('<!-- ====== MUC'):
        current_section = part
        section_opens[current_section] = 0
        section_closes[current_section] = 0
    elif current_section not in section_opens:
        section_opens[current_section] = 0
        section_closes[current_section] = 0
    
    if current_section in section_opens:
        section_opens[current_section] += len(re.findall(r'<div\s', part))
        section_closes[current_section] += part.count('</div>')

for s in section_opens:
    o = section_opens[s]
    c = section_closes[s]
    diff = c - o
    status = "OK" if diff == 0 else (f"+{diff} extra close" if diff > 0 else f"{diff} extra open")
    print(f'{s[:50]:50s} Opens={o:3d} Closes={c:3d} Diff={diff:3d} ({status})')

# The imbalance is 1 extra close. Let me look for patterns
# Find positions of all </div> that are on their own line and preceded by another </div>
lines = content.split('\n')
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped == '</div>' and i > 0:
        prev_stripped = lines[i-1].strip()
        if prev_stripped == '</div>':
            # Show context
            start = max(0, i-3)
            end = min(len(lines), i+4)
            print(f'\nConsecutive </div> at lines {i+1}-{i+2}:')
            for j in range(start, end):
                marker = ' <<<' if j >= i else ''
                print(f'  {j+1}: {lines[j].rstrip()}{marker}')
