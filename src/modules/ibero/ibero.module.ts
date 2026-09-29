import { Module } from '@nestjs/common';
import { IberoController } from './ibero.controller';
import { IberoService } from './ibero.service';

@Module({
  controllers: [IberoController],
  providers: [IberoService],
})
export class IberoModule {}
