import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class SharedView {
  @Prop({ required: true, unique: true, index: true })
  token!: string;

  @Prop({ required: true })
  owner!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  snapshot!: Record<string, unknown>;

  @Prop({ default: false })
  claimed!: boolean;

  @Prop()
  claimedAt?: Date;

  @Prop({ required: true })
  expiresAt!: Date;
}

export const SharedViewSchema = SchemaFactory.createForClass(SharedView);

SharedViewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
