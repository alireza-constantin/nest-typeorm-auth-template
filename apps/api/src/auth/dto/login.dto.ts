import { IsEmail, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'customer@example.test' })
  @IsEmail({ allow_display_name: false, require_tld: true })
  @MaxLength(254)
  email: string;

  @ApiProperty({ format: 'password', writeOnly: true, maxLength: 128 })
  @IsString()
  @MaxLength(128)
  password: string;
}
