import { runOwnerBootstrapCommand } from './bootstrap-owner.cli';

describe('owner bootstrap CLI arguments', () => {
  it.each([[], ['owner@example.test', 'password']])(
    'rejects any argument shape other than one email',
    async (...args: string[]) => {
      const error = jest.spyOn(console, 'error').mockImplementation();
      try {
        await expect(runOwnerBootstrapCommand(args)).resolves.toBe(2);
        expect(error).toHaveBeenCalledWith(
          'Usage: bootstrap-owner <existing-normalized-email>',
        );
        expect(JSON.stringify(error.mock.calls)).not.toContain('password');
      } finally {
        error.mockRestore();
      }
    },
  );
});
