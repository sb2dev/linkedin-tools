import { ApiProperty } from '@nestjs/swagger';
import { AccessToken } from '../../../application/auth.service';

export class AccessTokenDto implements AccessToken {
  @ApiProperty({ description: 'Send as `Authorization: Bearer <token>`.' })
  readonly accessToken!: string;

  @ApiProperty({ description: 'Lifetime in seconds.', example: 3600 })
  readonly expiresIn!: number;

  @ApiProperty({ example: 'admin' })
  readonly username!: string;
}
