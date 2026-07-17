import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CanvasState, CanvasStateSchema } from './canvas-state.schema';
import { CanvasesController } from './canvases.controller';
import { CanvasesService } from './canvases.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CanvasState.name, schema: CanvasStateSchema }]),
  ],
  controllers: [CanvasesController],
  providers: [CanvasesService],
})
export class CanvasesModule {}
