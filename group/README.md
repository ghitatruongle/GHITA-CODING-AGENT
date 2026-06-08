# Group - Multi-Agent System

## Structure

```
group/
├── README.md              # This guide
├── PROTOCOL.md            # Communication rules
├── agents.json            # Agent list & roles
├── create-chat.sh         # Script to create a new chat session
├── join-chat.sh           # Script for agent to join chat
│
└── Chat_YYYY-MM-DD_HH-MM-SS/  # Each chat session
    ├── director.txt       # Director (created first)
    ├── developer.txt      # Developer
    ├── reviewer.txt       # Reviewer
    ├── architect.txt      # Architect
    └── pm.txt             # PM
```

## Rules

1. **Director is absolute** - All agents must follow Director's commands
2. **Each agent has its own file** - Write to your own file, read from others
3. **Timestamp HH:MM:SS** - Required for every message

## Usage

### Director creates a chat session:

```bash
cd "D:\ghita coding agent\group"
bash create-chat.sh
```

### Other agents join:

```bash
bash join-chat.sh developer
bash join-chat.sh reviewer
bash join-chat.sh architect
bash join-chat.sh pm
```

### Or create files manually:

```bash
cd Chat_2026-05-31_14-30-45
echo "[14:31:00] Developer | Dev:" > developer.txt
echo "Joined. Reading orders..." >> developer.txt
```

## Message Format

```
[HH:MM:SS] Agent Name | Role:
Message content

---
```

## Director Command

```
[HH:MM:SS] Director | Director:
>>> COMMAND: Developer
Implement the API endpoint for Phase 7.

---

```

## Agent Response

```
[HH:MM:SS] Developer | Dev:
<<< ACK: Received command
Starting implementation. Estimated time: 30 minutes.

---
```
