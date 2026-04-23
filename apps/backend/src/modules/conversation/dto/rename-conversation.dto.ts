import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RenameConversationDto {
  @ApiProperty({ minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
}
