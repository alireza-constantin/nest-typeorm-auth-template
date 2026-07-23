import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailVerificationDto {
  @ApiProperty({
    description: 'Single-use token delivered by the configured email service.',
    writeOnly: true,
    minLength: 32,
    maxLength: 256,
  })
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  token: string;
}
