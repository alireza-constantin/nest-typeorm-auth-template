import { SetMetadata } from '@nestjs/common';
import { ADMIN_API_METADATA } from './authorization.constants';

/** Marks a controller as part of the default-deny administrative boundary. */
export const AdminApi = (): ClassDecorator =>
  SetMetadata(ADMIN_API_METADATA, true);
