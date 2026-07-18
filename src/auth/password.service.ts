import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PASSWORD_HASH_OPTIONS } from './auth.constants';

@Injectable()
export class PasswordService {
  private readonly dummyHash: Promise<string>;

  constructor() {
    // A fresh process-local hash keeps the unknown-account path computationally
    // equivalent to real password verification without storing a shared secret.
    this.dummyHash = this.hash('not-a-real-user-password');
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, PASSWORD_HASH_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return argon2.verify(passwordHash, password);
  }

  async verifyDummy(password: string): Promise<void> {
    await this.verify(await this.dummyHash, password);
  }
}
