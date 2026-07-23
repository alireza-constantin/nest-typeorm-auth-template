import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateStaffDto {
  @IsUUID('4')
  userId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  roleKeys: string[];
}
