import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @ApiPropertyOptional({ description: 'Optional title for the conversation', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
