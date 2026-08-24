import { randomUUID } from 'node:crypto';
import type { ForumReply, ForumThread } from './types.js';

/**
 * Lightweight discussion forum: threads + replies, scoped to a product/plugin.
 */
export class ForumManager {
  private threads = new Map<string, ForumThread>();
  private replies = new Map<string, ForumReply[]>(); // threadId → replies
  private threadByProduct = new Map<string, Set<string>>();

  /**
   * Create a new thread.
   */
  createThread(opts: {
    productId: string;
    title: string;
    authorId: string;
    body: string;
    tags?: string[];
  }): ForumThread {
    const t: ForumThread = {
      id: `th_${randomUUID()}`,
      productId: opts.productId,
      title: opts.title,
      authorId: opts.authorId,
      body: opts.body,
      tags: opts.tags ?? [],
      replyCount: 0,
      viewCount: 0,
      upvotes: 0,
      pinned: false,
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.threads.set(t.id, t);
    if (!this.threadByProduct.has(opts.productId))
      this.threadByProduct.set(opts.productId, new Set());
    this.threadByProduct.get(opts.productId)?.add(t.id);
    this.replies.set(t.id, []);
    return t;
  }

  /**
   * Add a reply.
   */
  reply(threadId: string, authorId: string, body: string): ForumReply {
    const thread = this.getThreadOrThrow(threadId);
    if (thread.locked) throw new Error('Thread is locked');
    const r: ForumReply = {
      id: `rp_${randomUUID()}`,
      threadId,
      authorId,
      body,
      upvotes: 0,
      accepted: false,
      createdAt: Date.now(),
    };
    this.replies.get(threadId)?.push(r);
    thread.replyCount++;
    thread.updatedAt = r.createdAt;
    return r;
  }

  /**
   * Mark a reply as accepted.
   */
  accept(replyId: string): boolean {
    for (const list of this.replies.values()) {
      const r = list.find((x) => x.id === replyId);
      if (r) {
        r.accepted = true;
        return true;
      }
    }
    return false;
  }

  /**
   * Upvote a thread.
   */
  upvoteThread(threadId: string): ForumThread {
    const t = this.getThreadOrThrow(threadId);
    t.upvotes++;
    return t;
  }

  /**
   * Increment view count.
   */
  view(threadId: string): void {
    const t = this.threads.get(threadId);
    if (t) t.viewCount++;
  }

  /**
   * Pin / unpin a thread.
   */
  pin(threadId: string, pinned: boolean): void {
    const t = this.getThreadOrThrow(threadId);
    t.pinned = pinned;
  }

  /**
   * Lock / unlock a thread.
   */
  lock(threadId: string, locked: boolean): void {
    const t = this.getThreadOrThrow(threadId);
    t.locked = locked;
  }

  /**
   * Get a thread by ID.
   */
  getThread(threadId: string): ForumThread | undefined {
    return this.threads.get(threadId);
  }

  /**
   * List threads for a product, newest activity first, pinned first.
   */
  listThreads(productId: string): ForumThread[] {
    const ids = this.threadByProduct.get(productId) ?? new Set();
    return Array.from(ids)
      .flatMap((id) => this.threads.get(id) ?? [])
      .filter(Boolean)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }

  /**
   * Get replies for a thread.
   */
  listReplies(threadId: string): ForumReply[] {
    return [...(this.replies.get(threadId) ?? [])];
  }

  private getThreadOrThrow(id: string): ForumThread {
    const t = this.threads.get(id);
    if (!t) throw new Error(`Thread not found: ${id}`);
    return t;
  }
}
