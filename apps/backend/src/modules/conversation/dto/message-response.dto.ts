import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() conversationId!: string;
  @ApiProperty() role!: string;
  @ApiProperty() content!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional() tokensInput?: number | null;
  @ApiPropertyOptional() tokensOutput?: number | null;
  @ApiPropertyOptional() costUsd?: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() completedAt?: Date | null;
  @ApiPropertyOptional() errorReason?: string | null;
}
