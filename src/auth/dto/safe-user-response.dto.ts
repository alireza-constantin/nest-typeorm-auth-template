import { ApiProperty } from '@nestjs/swagger';

export class SafeUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email', example: 'customer@example.test' })
  email: string;

  @ApiProperty({
    description: 'Whether ownership of the email address has been confirmed.',
  })
  emailVerified: boolean;
}
