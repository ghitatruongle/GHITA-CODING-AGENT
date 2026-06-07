import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import type { Orchestrator } from '../orchestrator.js';
import type { AIProviderType } from '@ghita/shared';
import type { ChatMessage } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đọc schema proto của agent
const PROTO_PATH = path.resolve(__dirname, '../proto/agent.proto');

// Lazy-init proto descriptor so importing this module in non-Node environments
// (e.g. Vite browser bundle) does not crash at evaluation time.
let _ghitaProto: Record<string, unknown> | undefined;

function getGhitaProto(): Record<string, unknown> {
  if (!_ghitaProto) {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as Record<
      string,
      unknown
    >;
    _ghitaProto = (protoDescriptor.ghita as Record<string, Record<string, unknown>>)?.v1 as Record<
      string,
      unknown
    >;
    if (!_ghitaProto) throw new Error('ghita.v1 package not found in proto definition');
  }
  return _ghitaProto;
}

const MAX_SESSIONS = 1000;

export class GrpcServer {
  private server: grpc.Server;
  private orchestrator: Orchestrator;
  private sessions: Map<string, ChatMessage[]> = new Map();

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
    this.server = new grpc.Server();
    const ghitaProto = getGhitaProto();
    const agentService = (
      ghitaProto as Record<string, grpc.ServiceDefinition<Record<string, unknown>>> | undefined
    )?.AgentService;
    if (!agentService) throw new Error('AgentService not found in proto definition');
    this.server.addService(
      agentService.service as unknown as grpc.ServiceDefinition<
        Record<string, grpc.MethodDefinition<Record<string, unknown>, Record<string, unknown>>>
      >,
      {
        Chat: this.handleChat.bind(this),
      },
    );
  }

  /**
   * Khởi chạy gRPC server
   */
  start(port: number = 50051, host: string = 'localhost'): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.bindAsync(
        `${host}:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (error, boundPort) => {
          if (error) {
            console.error('Failed to bind gRPC server:', error);
            reject(error);
            return;
          }
          // Caller (server.mjs) logs with [GHITA] prefix; avoid duplicate output
          resolve(boundPort);
        },
      );
    });
  }

  /**
   * Dừng gRPC server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        console.info('gRPC Server stopped.');
        resolve();
      });
    });
  }

  /**
   * Xử lý luồng gRPC song phương (duplex stream) Chat
   */
  private handleChat(
    call: grpc.ServerDuplexStream<Record<string, unknown>, Record<string, unknown>>,
  ) {
    let sessionId = '';
    let interrupted = false;
    let previousMessages: ChatMessage[] = [];

    // Map lưu trữ các hàm resolve đang chờ user duyệt chạy tool
    const pendingRequests = new Map<
      string,
      (reply: { approved: boolean; reason?: string }) => void
    >();

    call.on('data', async (clientMessage: Record<string, unknown>) => {
      try {
        sessionId = (clientMessage.session_id as string) || sessionId || randomUUID();

        // 1. Nhận tin nhắn khởi đầu
        if (clientMessage.request) {
          interrupted = false;
          const req = clientMessage.request as Record<string, unknown>;
          const userPrompt = req.prompt as string;
          const requestedProvider = (req.provider as string) || undefined;

          // Hỗ trợ khôi phục session cũ
          if (sessionId && this.sessions.has(sessionId)) {
            previousMessages = [...(this.sessions.get(sessionId) ?? [])];
          } else {
            previousMessages = [];
          }

          // Cập nhật lịch sử message từ request
          const history = req.history as Array<Record<string, string>> | undefined;
          if (history && history.length > 0) {
            previousMessages = history.map((msg) => ({
              role: msg.role as ChatMessage['role'],
              content: msg.content ?? '',
            }));
          }

          // Đưa prompt mới của user vào lịch sử
          const userMessage: ChatMessage = { role: 'user', content: userPrompt || '' };
          previousMessages.push(userMessage);

          let fullText = '';
          const promptTokens = 0;
          const completionTokens = 0;

          // Viết luồng stream token tới Client
          try {
            const stream = this.orchestrator.chatStream(previousMessages, {
              provider: requestedProvider as AIProviderType | undefined,
            });

            for await (const chunk of stream) {
              if (interrupted) break;

              // Trích xuất text chunk từ stream chunk
              if (chunk.content) {
                fullText += chunk.content;
                call.write({
                  session_id: sessionId,
                  text_chunk: {
                    text: chunk.content,
                  },
                });
              }

              // Giải lập một Tool call hoặc hook kiểm thử nếu có cấu trúc tool calls từ chunk
              // (Sau này tích hợp sâu các MCP / custom skills vào đây)
            }

            if (!interrupted) {
              // Thêm response của AI vào lịch sử
              previousMessages.push({ role: 'assistant', content: fullText });

              // Lưu trữ session
              if (sessionId) {
                if (!this.sessions.has(sessionId) && this.sessions.size >= MAX_SESSIONS) {
                  const oldestSessionId = this.sessions.keys().next().value;
                  if (oldestSessionId !== undefined) {
                    this.sessions.delete(oldestSessionId);
                  }
                }
                this.sessions.set(sessionId, previousMessages);
              }

              // Báo hiệu hoàn tất
              call.write({
                session_id: sessionId,
                done: {
                  summary: 'Hoàn thành lượt hội thoại mượt mà.',
                  usage: {
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    estimated_cost_usd: 0.0,
                  },
                },
              });
            }
          } catch (err: unknown) {
            const message =
              err instanceof Error ? err.message : 'LLM provider encountered an error';
            console.error('Error generating streaming response:', err);
            call.write({
              session_id: sessionId,
              error: {
                code: 'PROVIDER_ERROR',
                message,
              },
            });
            call.end();
          }

          // 2. Nhận phản hồi duyệt quyền chạy Tool từ người dùng (Human-in-the-loop)
        } else if (clientMessage.response) {
          const resp = clientMessage.response as Record<string, unknown>;
          const toolCallId = resp.tool_call_id as string | undefined;
          const approved = resp.approved as boolean | undefined;
          const reason = resp.reason as string | undefined;

          if (toolCallId && pendingRequests.has(toolCallId)) {
            const resolve = pendingRequests.get(toolCallId);
            if (resolve) resolve({ approved: approved ?? false, reason });
            pendingRequests.delete(toolCallId);
          }

          // 3. Nhận tín hiệu hủy tiến trình
        } else if (clientMessage.cancel) {
          interrupted = true;
          call.write({
            session_id: sessionId,
            done: {
              summary: 'Tiến trình đã bị ngắt bởi tín hiệu hủy của client.',
            },
          });
          call.end();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Internal server error';
        console.error('gRPC Error processing stream item:', err);
        call.write({
          session_id: sessionId,
          error: {
            code: 'INTERNAL',
            message,
          },
        });
        call.end();
      }
    });

    call.on('end', () => {
      interrupted = true;
      // Giải phóng tất cả các request phê duyệt tool đang bị treo
      for (const resolve of pendingRequests.values()) {
        resolve({ approved: false, reason: 'Stream ended by client' });
      }
      pendingRequests.clear();
    });
  }
}
