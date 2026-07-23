import { SetMetadata } from '@nestjs/common';

/**
 * Transport metadata only. Authentication policy remains owned by Identity's
 * session guard, which decides how public routes are handled.
 */
export const IS_PUBLIC_ROUTE = 'platform:http:is-public-route';

export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);
