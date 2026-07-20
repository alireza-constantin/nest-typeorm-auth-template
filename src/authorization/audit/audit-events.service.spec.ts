import { BadRequestException } from '@nestjs/common';
import { AuditEventsService } from './audit-events.service';

describe('AuditEventsService', () => {
  const event = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    actorUserId: '123e4567-e89b-42d3-a456-426614174001',
    action: 'staff.created',
    targetType: 'staff_user',
    targetId: '123e4567-e89b-42d3-a456-426614174002',
    requestId: 'request-123',
    metadata: { roleKeys: ['support_agent'] },
    createdAt: new Date('2026-07-20T12:00:00.000Z'),
    // This relationship is deliberately not part of the HTTP response.
    actor: { email: 'never-expose@example.test' },
  };

  function serviceReturning(events: readonly (typeof event)[]) {
    const query = {
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(events),
    };
    const dataSource = {
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue(query),
      }),
    };
    return { service: new AuditEventsService(dataSource as never), query };
  }

  it('returns a safe bounded page and an opaque next cursor', async () => {
    const later = {
      ...event,
      id: '123e4567-e89b-42d3-a456-426614174003',
      createdAt: new Date('2026-07-20T12:01:00.000Z'),
    };
    const { service } = serviceReturning([later, event]);

    const result = await service.list({ limit: 1 });

    expect(result.data).toEqual([
      expect.objectContaining({ id: later.id, metadata: later.metadata }),
    ]);
    expect(result.data[0]).not.toHaveProperty('actor');
    expect(JSON.stringify(result)).not.toContain('never-expose@example.test');
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('rejects malformed cursors before querying audit data', async () => {
    const { service } = serviceReturning([]);

    await expect(
      service.list({ limit: 1, cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
