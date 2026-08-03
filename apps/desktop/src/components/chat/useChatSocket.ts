// ==============================================================================
// GHITA CODING AGENT — Chat Socket Hook
// Manages Socket.IO connection, event listeners, and stream buffering.
// ==============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { invoke } from '@tauri-apps/api/core';
import { getSharedSocket } from '../../utils/sharedSocket';
import { generateUUID, type AgentEvent } from '@ghita/shared';
import { useAppStore } from '../../stores/appStore';
import type { ChatMessage } from '../../hooks/useChatSessions';
import { loadApiConfig } from '../../utils/apiConfig';

export interface ToolApprovalRequest {
  toolCallId: string;
  name: string;
  arguments: string;
  warningMessage?: string;
  approvalKind?: 'tool' | 'command';
}

export interface FileApprovalRequest {
  id: string;
  operation: string;
  filePath: string;
}

export interface ResumeApprovalRequest {
  runId: string;
  pendingTools: string[];
  message: string;
}

export interface AgentRunSummary {
  runId: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted' | 'exhausted';
  task: string;
  agentName?: string;
  nextIteration: number;
  stepsCount: number;
  pendingActionsCount: number;
  outputPreview: string;
  error: string;
  updatedAt: number;
}

export interface RalphProgress {
  iteration: number;
  cost: number;
  message: string;
  code?: string;
}

interface UseChatSocketConfig {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  tRef: React.MutableRefObject<(key: string, params?: Record<string, string | number>) => string>;
  reconnectTrigger: number;
}

export function useChatSocket({ setMessages, tRef, reconnectTrigger }: UseChatSocketConfig) {
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('disconnected');
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [approvalRequest, setApprovalRequest] = useState<ToolApprovalRequest | null>(null);
  const [fileApprovalRequest, setFileApprovalRequest] = useState<FileApprovalRequest | null>(null);
  const [resumeApprovalRequest, setResumeApprovalRequest] = useState<ResumeApprovalRequest | null>(
    null,
  );
  const [agentRuns, setAgentRuns] = useState<AgentRunSummary[]>([]);
  const [ralphProgress, setRalphProgress] = useState<RalphProgress | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [activeFlow, setActiveFlow] = useState<'ralph' | 'agent' | null>(null);

  const terminalCwd = useAppStore((s) => s.terminalCwd);

  const socketRef = useRef<Socket | null>(null);

  const syncApiConfig = useCallback((socket: Socket) => {
    void loadApiConfig()
      .then((config) => {
        if (socket.connected) socket.emit('sync_api_config', { config });
      })
      .catch((error) => {
        console.warn('[ChatPanel] Secure API configuration could not be loaded:', error);
      });
  }, []);

  // Streaming buffer: accumulate tokens and flush every 50ms
  const streamBufferRef = useRef('');
  const streamFlushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startStreamFlush = useCallback(() => {
    if (streamFlushIntervalRef.current) return;
    streamFlushIntervalRef.current = setInterval(() => {
      const buffered = streamBufferRef.current;
      if (!buffered) return;
      streamBufferRef.current = '';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === 'streaming-message' ? { ...msg, content: msg.content + buffered } : msg,
        ),
      );
    }, 50);
  }, [setMessages]);

  const stopStreamFlush = useCallback(() => {
    if (streamFlushIntervalRef.current) {
      clearInterval(streamFlushIntervalRef.current);
      streamFlushIntervalRef.current = null;
    }
    const remaining = streamBufferRef.current;
    if (remaining) {
      streamBufferRef.current = '';
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === 'streaming-message' ? { ...msg, content: msg.content + remaining } : msg,
        ),
      );
    }
  }, [setMessages]);

  // Sync workspace root to server
  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('set_workspace', { path: terminalCwd || null });
    }
  }, [terminalCwd]);

  // Connect to shared Socket.io singleton
  useEffect(() => {
    let active = true;

    const initSocket = async () => {
      try {
        setConnectionStatus('connecting');
        const socket = await getSharedSocket();
        if (!active || !socket) {
          if (active) setConnectionStatus('disconnected');
          return;
        }

        socketRef.current = socket;

        if (socket.connected) {
          if (active) setConnectionStatus('connected');
          const cwd = useAppStore.getState().terminalCwd;
          socket.emit('set_workspace', { path: cwd || null });
          syncApiConfig(socket);
          socket.emit('list_agent_runs', { limit: 30 });
        }

        socket.on('connect', () => {
          if (active) setConnectionStatus('connected');
          const cwd = useAppStore.getState().terminalCwd;
          socket.emit('set_workspace', { path: cwd || null });
          syncApiConfig(socket);
          socket.emit('list_agent_runs', { limit: 30 });
        });

        socket.on('disconnect', () => {
          if (active) {
            setConnectionStatus('disconnected');
            setIsSending(false);
            setActiveFlow(null);
            setApprovalRequest(null);
            setFileApprovalRequest(null);
            setResumeApprovalRequest(null);
            setRalphProgress(null);
            stopStreamFlush();
            setMessages((prev) => prev.filter((msg) => msg.id !== 'streaming-message'));
          }
        });

        socket.on('connect_error', (err) => {
          console.warn('[ChatPanel] Socket connection error:', err);
          if (active) {
            setConnectionStatus('disconnected');
            setIsSending(false);
            setActiveFlow(null);
            setApprovalRequest(null);
            setFileApprovalRequest(null);
            setResumeApprovalRequest(null);
            setRalphProgress(null);
          }
        });

        // AI Streaming Event Listeners
        socket.on('chat_start', (data: { text: string; senderId: string; senderName: string }) => {
          if (!active) return;
          setIsSending(true);

          if (data.senderId !== 'desktop' && data.senderId !== 'system') {
            setMessages((prev) => [
              ...prev,
              {
                id: generateUUID(),
                role: 'user',
                content: data.text,
                timestamp: Date.now(),
              },
            ]);
          }

          setMessages((prev) => {
            const hasStreaming = prev.some((msg) => msg.id === 'streaming-message');
            if (hasStreaming) return prev;
            return [
              ...prev,
              {
                id: 'streaming-message',
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
              },
            ];
          });
        });

        socket.on('chat_chunk', (data: { text: string }) => {
          if (!active) return;
          streamBufferRef.current += data.text;
          startStreamFlush();
        });

        socket.on(
          'chat_done',
          (data: {
            text: string;
            usage?: {
              promptTokens: number;
              completionTokens: number;
              totalTokens: number;
              costUsd?: number;
            };
          }) => {
            if (!active) return;
            stopStreamFlush();
            const finalId = generateUUID();
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === 'streaming-message'
                  ? { id: finalId, role: 'assistant', content: data.text, timestamp: Date.now() }
                  : msg,
              ),
            );
            setIsSending(false);
            setActiveFlow(null);

            if (data.usage) {
              const currentStats = useAppStore.getState().dashboardStats;
              useAppStore.getState().setDashboardStats({
                totalTokens: currentStats.totalTokens + data.usage.totalTokens,
                totalCost: currentStats.totalCost + (data.usage.costUsd ?? 0),
                activeAgents: currentStats.activeAgents,
                mcpConnections: currentStats.mcpConnections,
              });
              const used = data.usage.totalTokens;
              const max = 128000;
              useAppStore.getState().setContextUsage({
                used: Math.min(used, max),
                max,
                percentage: Math.round((used / max) * 100),
              });
            }
          },
        );

        socket.on('chat_error', (data: { message: string }) => {
          if (!active) return;
          stopStreamFlush();
          const errorMessage = `❌ **${tRef.current('chat.systemError')}** ${data.message}`;
          setMessages((prev) => {
            let replacedStreaming = false;
            const next = prev.map((msg) => {
              if (msg.id !== 'streaming-message') return msg;
              replacedStreaming = true;
              return {
                id: generateUUID(),
                role: 'assistant' as const,
                content: errorMessage,
                timestamp: Date.now(),
              };
            });
            return replacedStreaming
              ? next
              : [
                  ...prev,
                  {
                    id: generateUUID(),
                    role: 'assistant' as const,
                    content: errorMessage,
                    timestamp: Date.now(),
                  },
                ];
          });
          setIsSending(false);
          setActiveFlow(null);
        });

        // Human-in-the-loop: Request tool execution approval
        socket.on('action_required', (data: ToolApprovalRequest) => {
          if (active) {
            setApprovalRequest({ ...data, approvalKind: 'tool' });
            setIsSending(false);
            setActiveFlow(null);
          }
        });

        socket.on(
          'require_approval',
          (data: { id: string; command: string; warningMessage?: string }) => {
            if (active) {
              setApprovalRequest({
                toolCallId: data.id,
                name: 'run_command',
                arguments: JSON.stringify({ command: data.command }, null, 2),
                warningMessage: data.warningMessage,
                approvalKind: 'command',
              });
            }
          },
        );

        socket.on(
          'require_file_approval',
          (data: { id: string; operation: string; filePath: string }) => {
            if (active) {
              setFileApprovalRequest(data);
            }
          },
        );

        socket.on('agent_resume_confirmation_required', (data: ResumeApprovalRequest) => {
          if (active) {
            setResumeApprovalRequest(data);
            setIsSending(false);
            setActiveFlow(null);
          }
        });

        socket.on('agent_runs', (data: { runs?: AgentRunSummary[] }) => {
          if (active && Array.isArray(data.runs)) {
            setAgentRuns(data.runs);
          }
        });

        socket.on('agent_run_done', () => {
          socket.emit('list_agent_runs', { limit: 30 });
        });

        // Phase 3: Listen to live agent runtime events
        socket.on('agent_event', (event: AgentEvent) => {
          if (active) {
            setAgentEvents((prev) => {
              const next = [...prev, event];
              if (next.length > 15) next.shift();
              return next;
            });

            if (event.type === 'skill:learning') {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateUUID(),
                  role: 'assistant',
                  content: `⚡ **${tRef.current('chat.skillLearned')}**\n\n**${event.payload?.name || 'Unnamed Skill'}**\n*${tRef.current('chat.description')}:* ${event.payload?.description || ''}\n\n${tRef.current('chat.skillSaved')}`,
                  timestamp: Date.now(),
                },
              ]);
            }
          }
        });

        socket.on(
          'ralph_loop_progress',
          (data: { iteration: number; cost: number; message: string; code?: string }) => {
            if (active) setRalphProgress(data);
          },
        );

        socket.on('ralph_loop_done', () => {
          if (active) setRalphProgress(null);
        });

        socket.on(
          'computer_use_step',
          (data: {
            action?: string;
            screenshot: string;
            point?: { x: number; y: number };
            box?: { x1: number; y1: number; x2: number; y2: number };
          }) => {
            if (active) {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateUUID(),
                  role: 'assistant',
                  content: data.action
                    ? `🤖 **[Computer Action]** ${data.action}`
                    : `🤖 **[Computer Action]** ${tRef.current('chat.runningAutomation')}`,
                  timestamp: Date.now(),
                  computerUsePreview: {
                    screenshot: data.screenshot,
                    point: data.point,
                    box: data.box,
                  },
                },
              ]);
            }
          },
        );
      } catch (err) {
        console.error('[ChatPanel] Socket initialization failed:', err);
        if (active) setConnectionStatus('disconnected');
      }
    };

    initSocket();

    return () => {
      active = false;
      stopStreamFlush();
      const sock = socketRef.current;
      if (sock) {
        sock.off('connect');
        sock.off('disconnect');
        sock.off('connect_error');
        sock.off('chat_start');
        sock.off('chat_chunk');
        sock.off('chat_done');
        sock.off('chat_error');
        sock.off('action_required');
        sock.off('require_approval');
        sock.off('require_file_approval');
        sock.off('agent_resume_confirmation_required');
        sock.off('agent_runs');
        sock.off('agent_run_done');
        sock.off('agent_event');
        sock.off('ralph_loop_progress');
        sock.off('ralph_loop_done');
        sock.off('computer_use_step');
      }
    };
  }, [reconnectTrigger, stopStreamFlush, syncApiConfig]);

  const handleReconnect = async () => {
    if (connectionStatus === 'connected') return;
    setConnectionStatus('connecting');
    try {
      if (import.meta.env.DEV)
        console.info('[ChatPanel] Manual reconnect triggered, starting sidecar server...');
      await invoke('start_server');
      // L5 FIX: Wait for server readiness signal instead of hardcoded timeout
      const maxWait = 10000;
      const pollInterval = 200;
      let waited = 0;
      let serverReady = false;
      while (waited < maxWait) {
        try {
          const status = await invoke<{ status: string }>('get_server_status');
          if (status.status === 'running' || status.status === 'starting') {
            serverReady = true;
            break;
          }
        } catch {
          // Server not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        waited += pollInterval;
      }
      if (!serverReady && import.meta.env.DEV) {
        console.warn('[ChatPanel] Server readiness timeout after', maxWait, 'ms');
      }
      // Caller must increment reconnectTrigger to trigger re-init
    } catch (e) {
      console.error('[ChatPanel] Manual reconnect failed:', e);
      setConnectionStatus('disconnected');
    }
  };

  const handleApproveTool = () => {
    if (!approvalRequest || !socketRef.current) return;
    if (approvalRequest.approvalKind === 'command') {
      socketRef.current.emit('approve_command', { id: approvalRequest.toolCallId });
    } else {
      socketRef.current.emit('approve', { toolCallId: approvalRequest.toolCallId });
    }
    setApprovalRequest(null);
  };

  const handleRejectTool = (reason: string = 'User rejected execution') => {
    if (!approvalRequest || !socketRef.current) return;
    if (approvalRequest.approvalKind === 'command') {
      socketRef.current.emit('reject_command', { id: approvalRequest.toolCallId });
    } else {
      socketRef.current.emit('reject', { toolCallId: approvalRequest.toolCallId, reason });
    }
    setApprovalRequest(null);
  };

  const handleApproveFileWrite = () => {
    if (!fileApprovalRequest || !socketRef.current) return;
    socketRef.current.emit('approve_command', { id: fileApprovalRequest.id });
    setFileApprovalRequest(null);
  };

  const handleRejectFileWrite = () => {
    if (!fileApprovalRequest || !socketRef.current) return;
    socketRef.current.emit('reject_command', { id: fileApprovalRequest.id });
    setFileApprovalRequest(null);
  };

  const handleConfirmResume = () => {
    if (!resumeApprovalRequest || !socketRef.current) return;
    socketRef.current.emit('agent_run', {
      resumeRunId: resumeApprovalRequest.runId,
      resumeConfirmed: true,
    });
    setResumeApprovalRequest(null);
    setIsSending(true);
    setActiveFlow('agent');
  };

  const handleRejectResume = () => {
    setResumeApprovalRequest(null);
  };

  const refreshAgentRuns = () => {
    socketRef.current?.emit('list_agent_runs', { limit: 30 });
  };

  const handleResumeRun = (runId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('agent_run', { resumeRunId: runId });
    setIsSending(true);
    setActiveFlow('agent');
  };

  return {
    socketRef,
    connectionStatus,
    setConnectionStatus,
    agentEvents,
    setAgentEvents,
    approvalRequest,
    fileApprovalRequest,
    resumeApprovalRequest,
    agentRuns,
    ralphProgress,
    isSending,
    setIsSending,
    activeFlow,
    setActiveFlow,
    handleReconnect,
    handleApproveTool,
    handleRejectTool,
    handleApproveFileWrite,
    handleRejectFileWrite,
    handleConfirmResume,
    handleRejectResume,
    refreshAgentRuns,
    handleResumeRun,
  };
}
