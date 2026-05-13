import { Module } from '@nestjs/common';
import { MongooseModule, MongooseModuleOptions } from '@nestjs/mongoose';
import { ConfigModule } from './shared/config/config.module';
import { ConfigService } from './shared/config/config.service';
import MongooseDelete from 'mongoose-delete';
import { UserModule } from './modules/users/user.module';
import { SharedModule } from './shared/shared.module';
import { AiModule } from './modules/ai/ai.module';
import { FilesModule } from './modules/files/files.module';
import { DuckdbModule } from './modules/duckdb/duckdb.module';
import { QueryModule } from './modules/query/query.module';
import { TablesModule } from './modules/tables/tables.module';
import { AnalysisModule } from './modules/analysis/analysis.module';

@Module({
  imports: [
    DuckdbModule,     // @Global() — DuckdbService available everywhere
    SharedModule,
    ConfigModule,
    FilesModule,
    QueryModule,
    TablesModule,
    AnalysisModule,
    AiModule,
    UserModule,
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (
        configService: ConfigService,
      ): Promise<MongooseModuleOptions> => {
        const uri = configService.getMongoConfig();
        return {
          uri: uri.uri,
          connectionFactory: (connection) => {
            connection.plugin(MongooseDelete, {
              deletedAt: true,
              overrideMethods: true,
            });
            return connection;
          },
        };
      },
    }),
  ],
})
export class AppModule {}
