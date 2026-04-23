import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { GeminiProvider } from './gemini.provider';

@Global()
@Module({
  providers: [{ provide: LlmService, useClass: GeminiProvider }],
  exports: [LlmService],
})
export class LlmModule {}
