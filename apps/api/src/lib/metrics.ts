// CloudWatch Embedded Metric Format (EMF) for AI cost guardrails
// (PLAN 6.7/7.6, ADR-0008).
//
// Writing a single JSON line to stdout is enough: the Lambda CloudWatch Logs
// agent extracts the embedded metric definition, so no extra IAM permissions
// (cloudwatch:PutMetricData) are needed. The monitoring module alarms on the
// exact namespace/dimension emitted here.

import {
  ESTIMATED_AI_COST_USD,
  GENERATION_METRIC_DIMENSION,
  GENERATION_METRIC_NAMESPACE,
} from '@aws-token-designer/shared'

export interface GenerationMetricOptions {
  stage: string
  /** Estimated cost in USD for one Stability ultra call. */
  costUsd?: number
}

/**
 * Emit `GenerationCount` (Count) and `EstimatedAICost` (None/USD) for one
 * Stability call. Called only after Stability returns an image, because that
 * is the point at which the external cost is incurred.
 */
export function emitGenerationMetrics(options: GenerationMetricOptions): void {
  const cost = options.costUsd ?? ESTIMATED_AI_COST_USD
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: GENERATION_METRIC_NAMESPACE,
            Dimensions: [[GENERATION_METRIC_DIMENSION]],
            Metrics: [
              { Name: 'GenerationCount', Unit: 'Count' },
              { Name: 'EstimatedAICost', Unit: 'None' },
            ],
          },
        ],
      },
      [GENERATION_METRIC_DIMENSION]: options.stage,
      GenerationCount: 1,
      EstimatedAICost: cost,
    }),
  )
}
