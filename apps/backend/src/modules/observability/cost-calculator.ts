import { Injectable } from '@nestjs/common';

@Injectable()
export class CostCalculator {
  /**
   * Compute cost in USD for a Gemini Flash request.
   * Formula: (inputTokens / 1_000_000) * 0.30 + (outputTokens / 1_000_000) * 2.50
   */
  calc(inputTokens: number, outputTokens: number): number {
    return (inputTokens / 1_000_000) * 0.3 + (outputTokens / 1_000_000) * 2.5;
  }
}
