import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { UserRoleEnum } from '../enums/user-role.enum';

@Schema({ timestamps: true })
export class User {
  @Prop()
  name!: string;

  @Prop({ unique: true, sparse: true })
  email?: string;

  @Prop({ unique: true })
  username!: string;

  @Prop()
  password?: string;

  @Prop({ enum: UserRoleEnum, default: UserRoleEnum.USER })
  role!: UserRoleEnum;

  @Prop({ default: false })
  isActive!: boolean;

  @Prop()
  logoUrl?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
