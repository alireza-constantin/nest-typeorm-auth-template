import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ format: 'password', writeOnly: true, maxLength: 128 })
  @IsString()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({
    format: 'password',
    writeOnly: true,
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword: string;
}
