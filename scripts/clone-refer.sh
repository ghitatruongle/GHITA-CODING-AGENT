#!/bin/bash
# ============================================================
# clone-refer.sh
# Clone 33 dự án open-source vào refer_project/ theo phân loại
# Usage: bash scripts/clone-refer.sh
# ============================================================

set -e

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REFER_DIR="$BASE_DIR/refer_project"

echo "============================================"
echo "  GHITA CODING AGENT - Clone Refer Projects"
echo "  33 dự án open-source"
echo "============================================"
echo ""

clone() {
    local dir="$1"
    local url="$2"
    local name="$3"
    local num="$4"
    local total="$5"

    if [ -d "$dir/.git" ]; then
        echo "[$num/$total] ⏭️  $name (already exists, skipping)"
    else
        echo "[$num/$total] 📦 Cloning $name..."
        git clone --depth 1 "$url" "$dir" 2>/dev/null || echo "  ⚠️  Failed to clone $name"
    fi
}

TOTAL=33

# ============================================
# AI Core (9)
# ============================================
echo ""
echo "=== AI Core ==="

clone "$REFER_DIR/ai-core/claude-code" \
    "https://github.com/anthropics/claude-code.git" \
    "Claude Code" 1 $TOTAL

clone "$REFER_DIR/ai-core/openclaw" \
    "https://github.com/openclaw/openclaw.git" \
    "OpenClaw" 2 $TOTAL

clone "$REFER_DIR/ai-core/openclaude" \
    "https://github.com/Gitlawb/openclaude.git" \
    "OpenClaude" 3 $TOTAL

clone "$REFER_DIR/ai-core/open-interpreter" \
    "https://github.com/OpenInterpreter/open-interpreter.git" \
    "Open Interpreter" 4 $TOTAL

clone "$REFER_DIR/ai-core/openhands" \
    "https://github.com/All-Hands-AI/OpenHands.git" \
    "OpenHands" 5 $TOTAL

clone "$REFER_DIR/ai-core/opendevin" \
    "https://github.com/OpenDevin/OpenDevin.git" \
    "OpenDevin" 6 $TOTAL

clone "$REFER_DIR/ai-core/autogpt" \
    "https://github.com/Significant-Gravitas/AutoGPT.git" \
    "AutoGPT" 7 $TOTAL

clone "$REFER_DIR/ai-core/ui-tars-desktop" \
    "https://github.com/bytedance/UI-TARS-desktop.git" \
    "UI-TARS Desktop" 8 $TOTAL

clone "$REFER_DIR/ai-core/hermes-agent" \
    "https://github.com/NousResearch/hermes-agent.git" \
    "Hermes Agent" 9 $TOTAL

# ============================================
# AI Framework (4)
# ============================================
echo ""
echo "=== AI Framework ==="

clone "$REFER_DIR/ai-framework/langchainjs" \
    "https://github.com/langchain-ai/langchainjs.git" \
    "LangChain.js" 10 $TOTAL

clone "$REFER_DIR/ai-framework/litellm" \
    "https://github.com/BerriAI/litellm.git" \
    "LiteLLM" 11 $TOTAL

clone "$REFER_DIR/ai-framework/vercel-ai" \
    "https://github.com/vercel/ai.git" \
    "Vercel AI SDK" 12 $TOTAL

clone "$REFER_DIR/ai-framework/crewai" \
    "https://github.com/crewAIInc/crewAI.git" \
    "CrewAI" 13 $TOTAL

# ============================================
# AI Tools (6)
# ============================================
echo ""
echo "=== AI Tools ==="

clone "$REFER_DIR/ai-tools/aider" \
    "https://github.com/paul-gauthier/aider.git" \
    "Aider" 14 $TOTAL

clone "$REFER_DIR/ai-tools/continue" \
    "https://github.com/continuedev/continue.git" \
    "Continue" 15 $TOTAL

clone "$REFER_DIR/ai-tools/swe-agent" \
    "https://github.com/princeton-nlp/SWE-agent.git" \
    "SWE-agent" 16 $TOTAL

clone "$REFER_DIR/ai-tools/composio" \
    "https://github.com/ComposioHQ/composio.git" \
    "Composio" 17 $TOTAL

clone "$REFER_DIR/ai-tools/skills" \
    "https://github.com/mattpocock/skills.git" \
    "Skills" 18 $TOTAL

clone "$REFER_DIR/ai-tools/ppt-master" \
    "https://github.com/hugohe3/ppt-master.git" \
    "PPT Master" 19 $TOTAL

# ============================================
# Browser (5)
# ============================================
echo ""
echo "=== Browser ==="

clone "$REFER_DIR/browser/playwright" \
    "https://github.com/microsoft/playwright.git" \
    "Playwright" 20 $TOTAL

clone "$REFER_DIR/browser/browser-use" \
    "https://github.com/browser-use/browser-use.git" \
    "Browser Use" 21 $TOTAL

clone "$REFER_DIR/browser/stagehand" \
    "https://github.com/browserbase/stagehand.git" \
    "Stagehand" 22 $TOTAL

clone "$REFER_DIR/browser/cloakbrowser" \
    "https://github.com/CloakHQ/CloakBrowser.git" \
    "CloakBrowser" 23 $TOTAL

clone "$REFER_DIR/browser/webarena" \
    "https://github.com/web-arena-x/webarena.git" \
    "WebArena" 24 $TOTAL

# ============================================
# Desktop (6)
# ============================================
echo ""
echo "=== Desktop ==="

clone "$REFER_DIR/desktop/tauri" \
    "https://github.com/tauri-apps/tauri.git" \
    "Tauri" 25 $TOTAL

clone "$REFER_DIR/desktop/react-native" \
    "https://github.com/facebook/react-native.git" \
    "React Native" 26 $TOTAL

clone "$REFER_DIR/desktop/nut-js" \
    "https://github.com/nut-tree/nut.js.git" \
    "nut.js" 27 $TOTAL

clone "$REFER_DIR/desktop/monaco-editor" \
    "https://github.com/microsoft/monaco-editor.git" \
    "Monaco Editor" 28 $TOTAL

clone "$REFER_DIR/desktop/xtermjs" \
    "https://github.com/xtermjs/xterm.js.git" \
    "xterm.js" 29 $TOTAL

clone "$REFER_DIR/desktop/node-pty" \
    "https://github.com/microsoft/node-pty.git" \
    "node-pty" 30 $TOTAL

# ============================================
# Infra (2)
# ============================================
echo ""
echo "=== Infra ==="

clone "$REFER_DIR/infra/socketio" \
    "https://github.com/socketio/socket.io.git" \
    "Socket.io" 31 $TOTAL

clone "$REFER_DIR/infra/ollama" \
    "https://github.com/ollama/ollama.git" \
    "Ollama" 32 $TOTAL

# ============================================
# Memory (1)
# ============================================
echo ""
echo "=== Memory ==="

clone "$REFER_DIR/memory/agentmemory" \
    "https://github.com/rohitg00/agentmemory.git" \
    "AgentMemory" 33 $TOTAL

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
echo "  ✅ Done! All 33 repos processed."
echo "============================================"
echo ""
echo "📊 Disk usage per category:"
echo ""
for dir in ai-core ai-framework ai-tools browser desktop infra memory; do
    if [ -d "$REFER_DIR/$dir" ]; then
        size=$(du -sh "$REFER_DIR/$dir" 2>/dev/null | cut -f1)
        count=$(ls -d "$REFER_DIR/$dir"/*/ 2>/dev/null | wc -l)
        echo "  $dir: $size ($count repos)"
    fi
done
echo ""
total=$(du -sh "$REFER_DIR" 2>/dev/null | cut -f1)
echo "  Total: $total"
echo ""
