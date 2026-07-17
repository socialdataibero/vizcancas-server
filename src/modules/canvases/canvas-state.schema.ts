import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class CanvasState {
  @Prop({ required: true, unique: true, index: true })
  username!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  state!: Record<string, unknown>;
}

export const CanvasStateSchema = SchemaFactory.createForClass(CanvasState);
