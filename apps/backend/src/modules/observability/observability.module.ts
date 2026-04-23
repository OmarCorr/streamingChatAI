import { Global, Module } from '@nestjs/common';
import { LangfuseService } from './langfuse.service';
import { CostCalculator } from './cost-calculator';

@Global()
@Module({
  providers: [LangfuseService, CostCalculator],
  exports: [LangfuseService, CostCalculator],
})
export class ObservabilityModule {}
