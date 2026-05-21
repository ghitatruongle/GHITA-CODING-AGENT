import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { Orchestrator } from '../orchestrator.js';
import type { ChatMessage } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Đọc schema proto của agent
const PROTO_PATH = path.resolve(__dirname, '../proto/agent.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
const ghitaProto = protoDescriptor.ghita.v1;

const MAX_SESSIONS = 1000;

export class GrpcServer {
  private server: grpc.Server;
  private orchestrator: Orchestrator;
  private sessions: Map<string, ChatMessage[]> = new Map();

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
    this.server = new grpc.Server();
    this.server.addService(ghitaProto.AgentService.service, {
      Chat: this.handleChat.bind(this),
    });
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
          console.log(`gRPC Server running at ${host}:${boundPort}`);
          resolve(boundPort);
        }
      );
    });
  }

  /**
   * Dừng gRPC server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        console.log('gRPC Server stopped.');
        resolve();
      });
    });
  }

  /**
   * Xử lý luồng gRPC song phương (duplex stream) Chat
   */
  private handleChat(call: grpc.ServerDuplexStream<any, any>) {
    let sessionId = '';
    let interrupted = false;
    let previousMessages: ChatMessage[] = [];

    // Map lưu trữ các hàm resolve đang chờ user duyệt chạy tool
    const pendingRequests = new Map<string, (reply: { approved: boolean; reason?: string }) => void>();

    call.on('data', async (clientMessage: any) => {
      try {
        sessionId = clientMessage.session_id || sessionId || randomUUID();

        // 1. Nhận tin nhắn khởi đầu
        if (clientMessage.request) {
          interrupted = false;
          const req = clientMessage.request;
          const userPrompt = req.prompt;
          const requestedProvider = req.provider || undefined;

          // Hỗ trợ khôi phục session cũ
          if (sessionId && this.sessions.has(sessionId)) {
            previousMessages = [...this.sessions.get(sessionId)!];
          } else {
            previousMessages = [];
          }

          // Cập nhật lịch sử message từ request
          if (req.history && req.history.length > 0) {
            previousMessages = req.history.map((msg: any) => ({
              role: msg.role,
              content: msg.content,
            }));
          }

          // Đưa prompt mới của user vào lịch sử
          const userMessage: ChatMessage = { role: 'user', content: userPrompt || '' };
          previousMessages.push(userMessage);

          let fullText = '';
          let promptTokens = 0;
          let completionTokens = 0;

          // Viết luồng stream token tới Client
          try {
            const stream = this.orchestrator.chatStream(previousMessages, {
              provider: requestedProvider as any,
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

          } catch (err: any) {
            console.error('Error generating streaming response:', err);
            call.write({
              session_id: sessionId,
              error: {
                code: 'PROVIDER_ERROR',
                message: err.message || 'LLM provider encountered an error',
              },
            });
            call.end();
          }

        // 2. Nhận phản hồi duyệt quyền chạy Tool từ người dùng (Human-in-the-loop)
        } else if (clientMessage.response) {
          const resp = clientMessage.response;
          const toolCallId = resp.tool_call_id;
          const approved = resp.approved;
          const reason = resp.reason;

          if (pendingRequests.has(toolCallId)) {
            pendingRequests.get(toolCallId)!({ approved, reason });
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

      } catch (err: any) {
        console.error('gRPC Error processing stream item:', err);
        call.write({
          session_id: sessionId,
          error: {
            code: 'INTERNAL',
            message: err.message || 'Internal server error',
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
