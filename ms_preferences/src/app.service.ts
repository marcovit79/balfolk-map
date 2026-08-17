import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getParameters(): Record<string, any> {
    return {};
  }
}
