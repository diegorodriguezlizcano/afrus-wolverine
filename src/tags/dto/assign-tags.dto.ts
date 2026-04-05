import { IsArray, IsString, ArrayNotEmpty } from 'class-validator';

export class AssignTagsDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'Tags array must not be empty' })
  @IsString({ each: true })
  tags: string[];
}
