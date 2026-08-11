import {
  BadRequestException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { SharedView } from './shared-view.schema';

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

@Injectable()
export class SharesService {
  constructor(
    @InjectModel(SharedView.name) private model: Model<SharedView>,
  ) {}

  async create(owner: string, snapshot: Record<string, unknown>): Promise<{ token: string; expiresAt: Date }> {
    const size = Buffer.byteLength(JSON.stringify(snapshot ?? {}), 'utf8');
    if (size > MAX_SNAPSHOT_BYTES) {
      throw new BadRequestException('La visualización es demasiado grande para compartir');
    }

    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + TTL_MS);

    try {
      await this.model.create({ token, owner, snapshot, expiresAt, claimed: false });
      return { token, expiresAt };
    } catch (error: any) {
      console.error(error);
      throw new HttpException(
        { message: ['ERROR_CREATING_SHARE'], detail: error.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async claim(token: string): Promise<{ snapshot: Record<string, unknown> }> {
    const now = new Date();
    const doc = await this.model.findOneAndUpdate(
      { token, claimed: false, expiresAt: { $gt: now } },
      { $set: { claimed: true, claimedAt: now } },
      { returnDocument: 'after' },
    ).lean().exec();

    if (doc) {
      return { snapshot: doc.snapshot };
    }

    const exists = await this.model.exists({ token });
    if (exists) {
      throw new GoneException('Este enlace ya fue usado o expiró');
    }
    throw new NotFoundException('Enlace no encontrado');
  }
}
