import { IsEmail, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestEmailVerificationDto {
  @ApiProperty({ format: 'email', example: 'customer@example.test' })
  @IsEmail({ allow_display_name: false, require_tld: true })
  @MaxLength(254)
  email: string;
}
