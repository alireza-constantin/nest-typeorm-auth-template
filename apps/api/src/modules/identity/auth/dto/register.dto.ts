import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ format: 'email', example: 'customer@example.test' })
  @IsEmail({ allow_display_name: false, require_tld: true })
  @MaxLength(254)
  email: string;

  @ApiProperty({
    format: 'password',
    writeOnly: true,
    minLength: 12,
    maxLength: 128,
  })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
