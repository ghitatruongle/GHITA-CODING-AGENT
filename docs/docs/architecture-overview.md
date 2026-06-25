# Architecture Overview

## System Context

```mermaid
graph TB
    subgraph "Desktop App (Tauri 2.x)"
        UI[React UI<br/>Monaco Editor]
        Terminal[xterm.js + node-pty]
        Sidecar[Node.js Sidecar]
        Rust[Rust Native Modules]
    end

    subgraph "AI Engine"
        Router[SmartRouter / AdaptiveRouter]
        Providers[13+ LLM Providers]
        MCP[MCP Client]
        Skills[Skill Registry]
    end

    subgraph "Mobile (React Native)"
        RemoteUI[Remote Control UI]
        ScreenCast[Screen Cast]
        BT[Bluetooth Pairing]
    end

    subgraph "Services"
        WS[Socket.IO Server]
        OAI[OpenAI API]
        ANTH[Anthropic API]
        OLLAMA[Ollama Local]
        GH[GitHub Integration]
    end

    UI --> Sidecar
    Terminal --> Sidecar
    Sidecar --> Rust
    Sidecar --> AI Engine
    Router --> Providers
    Router --> MCP
    MCP --> Skills
    Mobile --> WS
    WS --> Sidecar
    Providers --> OAI
    Providers --> ANTH
    Providers --> OLLAMA
    Skills --> GH
```

## Communication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant D as Desktop UI
    participant AE as AI Engine
    participant LLM as LLM Provider
    participant S as Skill System

    U->>D: Type message
    D->>AE: chatRequest()
    AE->>AE: Route by complexity
    AE->>LLM: streamChat()
    LLM-->>AE: Token stream
    AE-->>D: Stream response
    D-->>U: Render markdown
    Note over AE,LLM: Tool call detected
    AE->>S: executeTool()
    S-->>AE: ToolResult
    AE->>LLM: Continue with context
```

## Package Dependency Graph

```mermaid
graph LR
    shared[shared] --> ai-engine
    shared --> skills
    shared --> agents
    shared --> communication
    shared --> memory
    ai-engine --> skills
    ai-engine --> agents
    skills --> agents
    agents --> memory
    agents --> communication
    computer-use --> skills
    browser-control --> skills
    browser-control --> computer-use
```

## Data Flow

```mermaid
flowchart LR
    Input[User Input] --> Router{SmartRouter}
    Router -->|Simple| Fast[Fast Model<br/>GPT-4o-mini]
    Router -->|Medium| Balanced[Balanced Model<br/>Claude Sonnet]
    Router -->|Complex| Powerful[Powerful Model<br/>GPT-4o / Claude Opus]
    Fast --> Output[Response]
    Balanced --> Output
    Powerful --> Output
    Output --> Filter{PII / Content Filter}
    Filter -->|Clean| User[Show to User]
    Filter -->|Flagged| Review[Flag for Review]
```

## Security Layers

```mermaid
flowchart TD
    A[Input] --> B[Shell Escape]
    A --> C[SQL Injection Prevention]
    A --> D[PII Detection]
    A --> E[Content Filter]
    B --> F[Skill Execution]
    C --> F
    D --> F
    E --> F
    F --> G[Permission Check]
    G -->|Allow| H[Execute]
    G -->|Deny| I[Block + Audit]
    H --> J[Audit Log]
    I --> J
```

## Desktop-Mobile Pairing Flow

```mermaid
sequenceDiagram
    participant D as Desktop
    participant M as Mobile
    participant P as Pairing Manager

    D->>P: generateCode()
    P-->>D: 6-digit code
    D-->>M: Show QR / Code
    M->>P: validate(code)
    P-->>M: success/failure
    Note over D,M: Secure channel established
    D->>M: Screen stream (Socket.IO)
    M->>D: Touch events
    D->>M: Telemetry
```

## Tech Stack Layers

```mermaid
graph BT
    subgraph "Frontend"
        React[React 19]
        Monaco[Monaco Editor]
        xterm[xterm.js]
    end
    subgraph "Desktop"
        Tauri[Tauri 2.x]
        Rust[Rust Backend]
        Sidecar2[Node.js Sidecar]
    end
    subgraph "AI"
        Vercel[Vercel AI SDK]
        Providers2[Multi-Provider]
        MCP2[MCP Protocol]
    end
    subgraph "Mobile"
        RN[React Native]
        BLE[Bluetooth LE]
        WS2[WebSocket]
    end
    subgraph "Infra"
        Turbo[Turborepo]
        pnpm[pnpm Workspace]
        GH2[GitHub Actions]
    end

    React --> Tauri
    Monaco --> React
    xterm --> Sidecar2
    Tauri --> Rust
    Sidecar2 --> Vercel
    Vercel --> Providers2
    Vercel --> MCP2
    RN --> BLE
    RN --> WS2
    WS2 --> Sidecar2
    Turbo --> pnpm
```
