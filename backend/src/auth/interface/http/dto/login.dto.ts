import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  readonly username!: string;

  @ApiProperty({ example: 'admin', format: 'password', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  readonly password!: string;
}
