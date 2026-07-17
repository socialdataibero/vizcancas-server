import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CanvasState } from './canvas-state.schema';

@Injectable()
export class CanvasesService {
  constructor(
    @InjectModel(CanvasState.name) private model: Model<CanvasState>,
  ) {}

  async getMine(username: string): Promise<{ state: Record<string, unknown>; updatedAt?: Date } | null> {
    const doc = await this.model.findOne({ username: username.toLowerCase() }).lean().exec();
    if (!doc) return null;
    return {
      state: doc.state,
      updatedAt: (doc as { updatedAt?: Date }).updatedAt,
    };
  }

  async saveMine(username: string, state: Record<string, unknown>) {
    try {
      const doc = await this.model.findOneAndUpdate(
        { username: username.toLowerCase() },
        { $set: { state } },
        { returnDocument: 'after', upsert: true },
      ).exec();
      return { savedAt: (doc as unknown as { updatedAt?: Date }).updatedAt ?? new Date() };
    } catch (error: any) {
      console.error(error);
      throw new HttpException(
        { message: ['ERROR_SAVING_CANVAS'], detail: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
