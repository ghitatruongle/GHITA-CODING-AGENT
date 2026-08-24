import { randomUUID } from 'node:crypto';
import type { FeatureRequest } from './types.js';

/**
 * Manages feature requests and weighted voting per user.
 */
export class FeatureVoting {
  private requests = new Map<string, FeatureRequest>();
  private byProduct = new Map<string, Set<string>>();

  /**
   * Create a new feature request.
   */
  create(opts: {
    productId: string;
    authorId: string;
    title: string;
    description: string;
    useCase: string;
  }): FeatureRequest {
    const r: FeatureRequest = {
      id: `fr_${randomUUID()}`,
      productId: opts.productId,
      authorId: opts.authorId,
      title: opts.title,
      description: opts.description,
      useCase: opts.useCase,
      votes: 0,
      voters: new Map(),
      status: 'under-review',
      createdAt: Date.now(),
    };
    this.requests.set(r.id, r);
    if (!this.byProduct.has(opts.productId)) this.byProduct.set(opts.productId, new Set());
    this.byProduct.get(opts.productId)?.add(r.id);
    return r;
  }

  /**
   * Cast / change a vote. Returns the new total.
   */
  vote(requestId: string, userId: string, weight: 1 | -1): number {
    const r = this.getOrThrow(requestId);
    const previous = r.voters.get(userId);
    if (previous === weight) return r.votes;
    if (previous !== undefined) r.votes -= previous;
    r.voters.set(userId, weight);
    r.votes += weight;
    return r.votes;
  }

  /**
   * Remove a user's vote.
   */
  unvote(requestId: string, userId: string): number {
    const r = this.getOrThrow(requestId);
    const previous = r.voters.get(userId);
    if (previous === undefined) return r.votes;
    r.voters.delete(userId);
    r.votes -= previous;
    return r.votes;
  }

  /**
   * Update status.
   */
  updateStatus(requestId: string, status: FeatureRequest['status']): FeatureRequest {
    const r = this.getOrThrow(requestId);
    r.status = status;
    return r;
  }

  /**
   * List requests for a product, top-voted first.
   */
  listForProduct(
    productId: string,
    filter?: { status?: FeatureRequest['status'] },
  ): FeatureRequest[] {
    const ids = this.byProduct.get(productId) ?? new Set();
    return Array.from(ids)
      .flatMap((id) => this.requests.get(id) ?? [])
      .filter(Boolean)
      .filter((r) => (filter?.status ? r.status === filter.status : true))
      .sort((a, b) => b.votes - a.votes);
  }

  private getOrThrow(id: string): FeatureRequest {
    const r = this.requests.get(id);
    if (!r) throw new Error(`Feature request not found: ${id}`);
    return r;
  }
}
