import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SharedView, SharedViewSchema } from './shared-view.schema';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SharedView.name, schema: SharedViewSchema }]),
  ],
  controllers: [SharesController],
  providers: [SharesService],
})
export class SharesModule {}
