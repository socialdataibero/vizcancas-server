import { UpdateProfileDto } from './dto/update-user.dto';

import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from 'src/shared/auth/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from 'src/shared/auth/guards/roles.guard';
import { UserRoleEnum } from './enums/user-role.enum';
import { Roles } from 'src/shared/auth/roles.decorator';
import { PaginationDto } from 'src/shared/query/pagination.dto';
import { UpdateUserAccessDto } from './dto/update-user-access.dto';
import { ActiveGuard } from 'src/shared/auth/guards/access.guard';

@Controller('users')
export class UsersController {
  constructor(private service: UsersService) { }
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.service.create(dto);
  }

  @Post('sign-in')
  login(
    @Body(new ValidationPipe({ expectedType: LoginDto })) params: LoginDto,
  ) {
    return this.service.login(params);
  }

  @UseGuards(JwtAuthGuard)
  @Get('myProfile')
  getProfile(@Req() req) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, ActiveGuard)
  @Patch('profile')
  updateProfile(
    @Req() req,
    @Body() updateData: UpdateProfileDto
  ) {
    console.log(updateData)
    const identifier = req.user.username;
    return this.service.updateProfile(identifier, updateData);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  @Patch(':id')
  updateUserAccess(
    @Param('id') id: string,
    @Body() updateData: UpdateUserAccessDto
  ) {
    return this.service.updateUserAccess(id, updateData);
  }
}
