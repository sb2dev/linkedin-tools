/** One profile, by its LinkedIn username. */

import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser } from 'src/auth/domain/authenticated-user';
import { CurrentUser } from 'src/auth/interface/current-user.decorator';
import { OptionalJwtGuard } from 'src/auth/interface/optional-jwt.guard';
import { GetProfileUseCase, ProfileNotFoundError } from '../../application/get-profile.use-case';
import { ProfileDetail } from '../../domain/profile-detail';
import { ProfileParamsDto } from './dto/profile-params.dto';
import { ProfileDetailDto } from './dto/profile-detail.dto';
import { BOUND_VALIDATION_PIPE } from './bound-validation.pipe';

@ApiTags('Profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly getProfile: GetProfileUseCase) {}

  @Get(':username')
  @UseGuards(OptionalJwtGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Read one profile',
    description:
      'Public. Returns the profile, together with the `quality` block the importer recorded, so a ' +
      'sparse profile can be told apart from a badly parsed one. The `contact` object holds ' +
      'personal data and is omitted entirely unless the request carries a valid bearer token.',
  })
  @ApiOkResponse({ type: ProfileDetailDto })
  @ApiNotFoundResponse({ description: 'No profile has that LinkedIn username.' })
  async byUsername(
    @Param(BOUND_VALIDATION_PIPE) params: ProfileParamsDto,
    @CurrentUser() caller: AuthenticatedUser | undefined,
  ): Promise<ProfileDetail> {
    try {
      return await this.getProfile.execute(params.username, {
        includeContact: caller !== undefined,
      });
    } catch (error) {
      if (error instanceof ProfileNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
