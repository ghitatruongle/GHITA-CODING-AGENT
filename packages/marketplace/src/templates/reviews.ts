// ==============================================================================
// GHITA CODING AGENT - Template Review & Rating System (Phase 36)
// ==============================================================================

import type { TemplateReview } from './types.js';

/**
 * Review and rating system for agent templates.
 * Supports CRUD operations, aggregation, and helpfulness voting.
 */
export class TemplateReviewSystem {
  private reviews = new Map<string, TemplateReview>();
  private templateReviews = new Map<string, string[]>(); // templateId → reviewIds

  /**
   * Add a review for a template.
   */
  addReview(review: TemplateReview): void {
    this.reviews.set(review.id, review);

    if (!this.templateReviews.has(review.templateId)) {
      this.templateReviews.set(review.templateId, []);
    }
    this.templateReviews.get(review.templateId)?.push(review.id);
  }

  /**
   * Update an existing review.
   */
  updateReview(
    reviewId: string,
    updates: Partial<Pick<TemplateReview, 'rating' | 'title' | 'content'>>,
  ): TemplateReview | null {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    if (updates.rating !== undefined) review.rating = updates.rating;
    if (updates.title !== undefined) review.title = updates.title;
    if (updates.content !== undefined) review.content = updates.content;
    review.updatedAt = Date.now();

    return review;
  }

  /**
   * Delete a review.
   */
  deleteReview(reviewId: string): boolean {
    const review = this.reviews.get(reviewId);
    if (!review) return false;

    this.reviews.delete(reviewId);

    const ids = this.templateReviews.get(review.templateId);
    if (ids) {
      const idx = ids.indexOf(reviewId);
      if (idx >= 0) ids.splice(idx, 1);
    }

    return true;
  }

  /**
   * Get a review by ID.
   */
  getReview(reviewId: string): TemplateReview | undefined {
    return this.reviews.get(reviewId);
  }

  /**
   * Get all reviews for a template.
   */
  getReviewsForTemplate(
    templateId: string,
    options?: { sortBy?: 'newest' | 'rating' | 'helpful'; limit?: number },
  ): TemplateReview[] {
    const ids = this.templateReviews.get(templateId) ?? [];
    let reviews = ids
      .map((id) => this.reviews.get(id))
      .filter((r): r is TemplateReview => r !== undefined);

    // Sort
    switch (options?.sortBy) {
      case 'newest':
        reviews.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'rating':
        reviews.sort((a, b) => b.rating - a.rating);
        break;
      case 'helpful':
        reviews.sort((a, b) => b.helpfulCount - a.helpfulCount);
        break;
      default:
        reviews.sort((a, b) => b.createdAt - a.createdAt);
    }

    if (options?.limit) {
      reviews = reviews.slice(0, options.limit);
    }

    return reviews;
  }

  /**
   * Vote a review as helpful.
   */
  markHelpful(reviewId: string): boolean {
    const review = this.reviews.get(reviewId);
    if (!review) return false;
    review.helpfulCount++;
    return true;
  }

  /**
   * Get aggregate statistics for a template's reviews.
   */
  getAggregateStats(templateId: string): {
    averageRating: number;
    totalReviews: number;
    ratingDistribution: Record<number, number>;
    mostHelpfulReview: TemplateReview | null;
  } {
    const reviews = this.getReviewsForTemplate(templateId);
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    let totalRating = 0;
    let mostHelpful: TemplateReview | null = null;

    for (const review of reviews) {
      totalRating += review.rating;
      distribution[review.rating] = (distribution[review.rating] ?? 0) + 1;

      if (!mostHelpful || review.helpfulCount > mostHelpful.helpfulCount) {
        mostHelpful = review;
      }
    }

    return {
      averageRating: reviews.length > 0 ? totalRating / reviews.length : 0,
      totalReviews: reviews.length,
      ratingDistribution: distribution,
      mostHelpfulReview: mostHelpful,
    };
  }

  /**
   * Get reviews by a specific user across all templates.
   */
  getReviewsByUser(userId: string): TemplateReview[] {
    return Array.from(this.reviews.values()).filter((r) => r.reviewer.id === userId);
  }

  /**
   * Check if a user has reviewed a specific template.
   */
  hasUserReviewed(templateId: string, userId: string): boolean {
    const reviews = this.getReviewsForTemplate(templateId);
    return reviews.some((r) => r.reviewer.id === userId);
  }

  get totalReviews(): number {
    return this.reviews.size;
  }
}
