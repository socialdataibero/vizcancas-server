import { HttpException, HttpStatus, Injectable, NotFoundException, } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { User } from "./schemas/user.schema";
import { CreateUserDto } from "./dto/create-user.dto";
import { LoginDto } from "./dto/login.dto";
import { LoginResponse } from "./models/login-response.model";
import { compare, hash } from "bcrypt";
import { AuthService } from "src/shared/auth/auth.service";
import { PaginationDto } from "src/shared/query/pagination.dto";
import { UpdateUserAccessDto } from "./dto/update-user-access.dto";

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private model: Model<User>,
    private _authService: AuthService
  ) { }

  async login(params: LoginDto): Promise<LoginResponse> {
    const { username, password } = params;

    const user = await this.findOne({
      username: username.toLowerCase(),
    });

    if (!user) {
      throw new HttpException(
        { message: ['USER_NOT_FOUND'] },
        HttpStatus.NOT_FOUND,
      );
    }

    if (!user.password) {
      throw new HttpException(
        { message: ['USER_HAS_NO_PASSWORD'] },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isMatch = await compare(password, user.password);

    if (!isMatch) {
      throw new HttpException(
        { message: ['WRONG_PASSWORD'] },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.auth(user);
  }

  async findAll(query: PaginationDto) {
    try {
      const { page = 1, limit = 10, sortBy = '_id', sortDirection = 'desc', search, role, isActive } = query;
      const skip = (page - 1) * limit;

      const sortConfig: any = {};
      sortConfig[sortBy] = sortDirection === 'desc' ? -1 : 1;
      const filter: any = {};
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { username: { $regex: search, $options: 'i' } },
        ];
      }
      if (role) {
        filter.role = role;
      }

      if (isActive !== undefined) {
        filter.isActive = isActive === 'true';
      }

      const [data, total] = await Promise.all([
        this.model.find(filter).sort(sortConfig).skip(skip).limit(limit).exec(),
        this.model.countDocuments(),
      ]);

      return {
        data: data.map(user => this.sanitizeUser(user)),
        meta: {
          total,
          page,
          lastPage: Math.ceil(total / limit),
        },
      };
    } catch (error: any) {
      console.error(error);
      throw new HttpException(
        { message: ['ERROR_FETCHING_USERS'], detail: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  auth(user: User) {
    try {
      const payload = {
        username: user.username.toLowerCase(),
        role: user.role,
      };

      const token = this._authService.signPayload(payload);

      return {
        token,
        user: this.sanitizeUser(user),
      };
    } catch (error: any) {
      console.error(error);
      throw new HttpException(
        { message: ['AUTH_GENERATION_ERROR'], detail: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async create(dto: CreateUserDto): Promise<User> {
    try {
      if (dto.password) {
        dto.password = await hash(dto.password, 10);
      }

      dto.username = dto.username.toLowerCase();

      const user = await this.model.create(dto);
      return this.sanitizeUser(user);

    } catch (error: any) {
      console.error(error);

      if (error.code === 11000) {
        throw new HttpException(
          { message: ['USERNAME_ALREADY_EXISTS'] },
          HttpStatus.CONFLICT,
        );
      }

      if (error.name === 'ValidationError') {
        throw new HttpException(
          { message: ['VALIDATION_ERROR'], detail: error.message },
          HttpStatus.BAD_REQUEST,
        );
      }

      throw new HttpException(
        { message: ['ERROR_CREATING_USER'], detail: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateProfile(username: string, updateData: any) {
    try {
      const updatedUser = await this.model.findOneAndUpdate(
        { username: username },
        { $set: updateData },
        { new: true }
      );

      if (!updatedUser) {
        throw new HttpException(
          { message: ['USER_NOT_FOUND'] },
          HttpStatus.NOT_FOUND
        );
      }
      return this.sanitizeUser(updatedUser);

    } catch (error: any) {
      console.error(error);
      throw new HttpException(
        { message: ['ERROR_UPDATING_USER_PROFILE'], detail: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  sanitizeUser(user: any): any {
    if (!user) return null;
    const obj = user.toObject ? user.toObject() : user;
    delete obj.password;
    return obj;
  }

  async findByIdentifier(identifier: string) {
    const user = await this.model.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    });

    if (!user) {
      throw new HttpException(
        { message: ['USER_NOT_FOUND'] },
        HttpStatus.NOT_FOUND,
      );
    }

    return user;
  }

  async findById(id: string) {
    try {
      const user = await this.model.findById(id);
      if (!user) {
        throw new HttpException(
          { message: ['USER_NOT_FOUND'] },
          HttpStatus.NOT_FOUND,
        );
      }
      return user;
    } catch (error: any) {
      if (error.name === 'CastError') {
        throw new HttpException(
          { message: ['INVALID_ID_FORMAT'] },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw new HttpException(
        { message: ['ERROR_FETCHING_USER'] },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(filter = {}): Promise<User | null> {
    try {
      const result = await this.model.findOne(filter).exec();
      return result;
    } catch (error: any) {
      console.error(error);
      throw new HttpException(
        { message: ['DATABASE_QUERY_ERROR'] },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getProfile(authHeader: string) {
    if (!authHeader) {
      throw new HttpException(
        { message: ['NO_TOKEN_PROVIDED'] },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new HttpException(
        { message: ['INVALID_TOKEN_FORMAT'] },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = parts[1];

    try {
      const decoded: any = this._authService.verifyToken(token);

      const user = await this.findOne({
        username: decoded.username.toLowerCase(),
      });

      if (!user) {
        throw new HttpException(
          { message: ['USER_NOT_FOUND'] },
          HttpStatus.NOT_FOUND,
        );
      }

      return this.sanitizeUser(user);
    } catch (error: any) {
      console.error(error);

      if (error.status === HttpStatus.NOT_FOUND) {
        throw error;
      }

      throw new HttpException(
        { message: ['INVALID_OR_EXPIRED_TOKEN'] },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
  async updateUserAccess(id: string, updateData: UpdateUserAccessDto) {
    try {
      const updatedUser = await this.model.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      ).exec();

      if (!updatedUser) {
        throw new NotFoundException('User not found');
      }

      return this.sanitizeUser(updatedUser);

    } catch (error: any) {
      console.error(error);
      throw new HttpException(
        { message: ['ERROR_UPDATING_USER_ACCESS'], detail: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}