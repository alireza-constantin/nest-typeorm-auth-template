import { Transform } from 'class-transformer';
import { IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Cursor and filters intentionally expose only non-sensitive audit dimensions.
 * The cursor is opaque to callers and is bounded before it reaches Postgres.
 */
export class AuditEventsQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetId?: string;
}
