import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthorizationCatalogueSyncService } from './data';

@Injectable()
export class AuthorizationStartupService implements OnApplicationBootstrap {
  constructor(
    private readonly config: ConfigService,
    private readonly catalogue: AuthorizationCatalogueSyncService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const environment = this.config.getOrThrow<
      'development' | 'test' | 'production'
    >('environment');

    // Development and test schemas are disposable and synchronized. Production
    // receives this catalogue through its reviewed baseline migration/seed.
    if (environment !== 'production') {
      await this.catalogue.synchronize();
    }
  }
}
