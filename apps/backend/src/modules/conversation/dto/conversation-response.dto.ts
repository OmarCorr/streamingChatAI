import { ApiProperty } from '@nestjs/swagger';

export class ConversationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
