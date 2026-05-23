import re

path = 'D:/GHITA CODING AGENT/Plan/Update 0.0.2 beta2.html'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Strategy: count divs in each section to find the imbalance
# Let's find sections and count divs per section

# Count all open and close divs
open_divs = len(re.findall(r'<div\s', content))
close_divs = content.count('</div>')
print(f'Before: Open <div: {open_divs}, Close </div>: {close_divs}, Diff: {close_divs - open_divs}')

# The structure should be:
# <div class="container"> (1)
#   <div class="header"> (1)
#   </div>
#   <div class="section"> MUC 1 (1)
#     <div class="info-box"> (1)
#     <div class="card-grid"> (1)
#       <div class="card"> x4 (4)
#     </div>
#     <table>...</table>
#   </div>
#   <div class="section"> MUC 2 (1)
#     <div class="info-box"> x2 (2)
#     <table> x2</table>
#     <div class="prov-list"> (1)
#     <div class="feat-grid"> x2 (2)
#       <div class="feat-item"> x13 (13)
#     </div>
#   </div>
#   <div class="section"> MUC 3 (1)
#     <div class="phase-table"> (1)
#       <div class="phase-header"> x12 (12)
#       <div class="guide-step"> x15 (15)
#     </div>
#   </div>
#   <div class="section"> MUC 4 (1)
#     <div class="info-box"> (1)
#     <div class="phase-header"> x4 (4)
#     <table> x5</table>
#     <div class="info-box"> (1)
#     </div>
#   </div>
#   <div class="footer"> (1)
# </div>

# Let me just find where the extra </div> are by looking at patterns
# Split by sections to identify the problematic area

# Look for patterns where we have </div> on consecutive lines in the MUC 2 section
idx_muc2 = content.find('MUC 2')
idx_muc3 = content.find('MUC 3')
if idx_muc2 >= 0 and idx_muc3 >= 0:
    muc2_section = content[idx_muc2:idx_muc3]
    
    # Find all </div> positions in MUC 2 section
    div_close_positions = []
    pos = -1
    while True:
        pos = muc2_section.find('</div>', pos + 1)
        if pos == -1:
            break
        div_close_positions.append(pos)
    
    print(f'MUC 2 section has {len(div_close_positions)} </div> tags')
    
    # Expected: The MUC 2 section should have:
    # - 2 info-box closes (1 for Vercel, 1 for LangChain)
    # - 1 prov-list close (for Vercel providers)
    # - 1 feat-grid close (for LangChain features)
    # - Plus section close
    # Then 2.3 LiteLLM and 2.4 CrewAI are INSIDE MUC 2, so they add:
    # - 1 info-box close (LiteLLM)
    # - 1 prov-list close (LiteLLM providers)
    # - 1 feat-grid close (CrewAI features)
    # - 1 section close (MUC 2)
    # Total: 8 + 4 = 12
    
    # Let's look at the specific patterns
    
    # Find areas with multiple </div> close together
    for i in range(len(div_close_positions) - 2):
        d1 = div_close_positions[i]
        d2 = div_close_positions[i+1]
        d3 = div_close_positions[i+2]
        gap1 = d2 - d1 - 6  # 6 = len('</div>')
        gap2 = d3 - d2 - 6
        if gap1 < 10 and gap2 < 10:
            # Found 3 </div> within short distance
            context = muc2_section[max(0, d1-40):d3+30]
            print(f'\n--- Three consecutive </div> near position {d1} ---')
            print(repr(context))

# Let me also look for extra </div> at the end of the MUC 4 section or after
# Save the last part
idx_muc4 = content.find('MUC 4')
if idx_muc4 >= 0:
    last_part = content[idx_muc4:]
    # Count trailing </div>
    # Find the footer div
    footer_idx = last_part.find('footer')
    if footer_idx >= 0:
        after_footer = last_part[footer_idx:]
        print(f'\n--- After footer: {repr(after_footer[-200:])}')
