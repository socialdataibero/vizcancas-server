import * as dotenv from 'dotenv';
import * as dns from 'node:dns';

dotenv.config();

dns.setServers(['8.8.8.8', '1.1.1.1']);

export enum EnvKeys {
  PORT = 'PORT',
  MONGO_USER = 'MONGO_USER',
  MONGO_PASSWORD = 'MONGO_PASSWORD',
  MONGO_HOST = 'MONGO_HOST',
  MONGO_DATABASE = 'MONGO_DATABASE',
  JWT_KEY = 'JWT_KEY',
}

export class ConfigService {
  public get(key: EnvKeys): string {
    const value = process.env[key];

    if (!value) {
      throw new Error(`Missing environment variable: ${key}`);
    }

    return value;
  }

  public getPort(): number {
    return Number(process.env.PORT) || 3000;
  }

  public getMongoConfig() {
    const user = encodeURIComponent(this.get(EnvKeys.MONGO_USER));
    const password = encodeURIComponent(this.get(EnvKeys.MONGO_PASSWORD));
    const host = this.get(EnvKeys.MONGO_HOST);
    const database = this.get(EnvKeys.MONGO_DATABASE);

    return {
      uri: `mongodb+srv://${user}:${password}@${host}/${database}?retryWrites=true&w=majority`,
    };
  }

  public getJwtConfig() {
    return {
      secret: this.get(EnvKeys.JWT_KEY),
      signOptions: {
        expiresIn: '12h',
      },
    };
  }
}