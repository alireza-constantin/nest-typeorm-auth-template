import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { OwnerBootstrapService } from './owner-bootstrap.service';

/**
 * Invoke with one normalized-email argument, for example:
 * npx ts-node -r tsconfig-paths/register src/authorization/bootstrap/bootstrap-owner.cli.ts owner@example.com
 */
export async function runOwnerBootstrapCommand(
  args: readonly string[] = process.argv.slice(2),
): Promise<number> {
  if (args.length !== 1 || !args[0].trim()) {
    console.error('Usage: bootstrap-owner <existing-normalized-email>');
    return 2;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const result = await app.get(OwnerBootstrapService).bootstrap(args[0]);
    console.log(
      result.changed ? 'Owner bootstrap completed.' : 'Owner already active.',
    );
    return 0;
  } catch {
    // Do not echo an email, credential material, connection details, or a
    // database error from this operator-facing command.
    console.error('Owner bootstrap failed. Check the deployment logs.');
    return 1;
  } finally {
    await app.close();
  }
}

if (process.argv[1]?.includes('bootstrap-owner.cli')) {
  void runOwnerBootstrapCommand().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
