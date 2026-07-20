import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class StaffPaginationDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @Min(1)
  @Max(100)
  limit = 25;

  /** The last returned staff user UUID. Results are ordered by UUID ascending. */
  @IsOptional()
  @IsString()
  @IsUUID('4')
  cursor?: string;
}
