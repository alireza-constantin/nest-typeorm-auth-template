import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthorizationAuditEvent } from '../data';

interface AuditCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface SafeAuditEventResponse {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly requestId: string | null;
  readonly metadata: Record<
    string,
    | string
    | number
    | boolean
    | null
    | readonly (string | number | boolean | null)[]
  >;
  readonly createdAt: string;
}

export interface AuditEventListResponse {
  readonly data: readonly SafeAuditEventResponse[];
  readonly nextCursor: string | null;
}

@Injectable()
export class AuditEventsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    readonly cursor?: string;
    readonly limit: number;
    readonly action?: string;
    readonly targetType?: string;
    readonly targetId?: string;
  }): Promise<AuditEventListResponse> {
    const cursor = input.cursor ? this.decodeCursor(input.cursor) : undefined;
    const query = this.dataSource
      .getRepository(AuthorizationAuditEvent)
      .createQueryBuilder('event')
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .take(input.limit + 1);

    if (input.action)
      query.andWhere('event.action = :action', { action: input.action });
    if (input.targetType) {
      query.andWhere('event.targetType = :targetType', {
        targetType: input.targetType,
      });
    }
    if (input.targetId) {
      query.andWhere('event.targetId = :targetId', {
        targetId: input.targetId,
      });
    }
    if (cursor) {
      query.andWhere(
        '(event.createdAt < :cursorCreatedAt OR (event.createdAt = :cursorCreatedAt AND event.id < :cursorId))',
        { cursorCreatedAt: cursor.createdAt, cursorId: cursor.id },
      );
    }

    const events = await query.getMany();
    const hasNext = events.length > input.limit;
    const data = events
      .slice(0, input.limit)
      .map((event) => this.toResponse(event));
    const last = data.at(-1);
    return {
      data,
      nextCursor:
        hasNext && last
          ? this.encodeCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  private toResponse(event: AuthorizationAuditEvent): SafeAuditEventResponse {
    return {
      id: event.id,
      actorUserId: event.actorUserId,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      requestId: event.requestId,
      // Metadata is validated on each write against an action-specific allowlist.
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    };
  }

  private encodeCursor(cursor: AuditCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(value: string): AuditCursor {
    if (value.length > 512)
      throw new BadRequestException('Invalid audit cursor');
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      );
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof (parsed as AuditCursor).createdAt !== 'string' ||
        Number.isNaN(Date.parse((parsed as AuditCursor).createdAt)) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          (parsed as AuditCursor).id,
        )
      ) {
        throw new Error('invalid cursor');
      }
      return parsed as AuditCursor;
    } catch {
      throw new BadRequestException('Invalid audit cursor');
    }
  }
}
