/**
 * 成员邮件邀请：创建、校验、接受、重发与撤销。
 */

import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Role as PrismaRole } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { BusinessException } from '../../core/exceptions/business.exception';
import { ErrorCodes } from '../../core/exceptions/error-codes';
import {
  MEMBER_INVITED_EVENT,
  type MemberInvitedPayload,
} from '../../core/event-bus/events';
import { EmailNotificationService } from '../notification/email-notification.service';
import { AuditService } from '../access/audit.service';
import type { InviteMemberDto } from './dto/invite-member.dto';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class MemberInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailNotificationService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async inviteMember(
    organizationId: string,
    actorUserId: string,
    traceId: string,
    dto: InviteMemberDto,
  ) {
    const email = dto.email.trim().toLowerCase();
    const role = (dto.role ?? PrismaRole.MEMBER) as PrismaRole;

    const existingUser = await this.prisma.user.findFirst({
      where: { email },
      select: { id: true, organizationId: true, status: true },
    });

    if (existingUser && existingUser.organizationId !== organizationId) {
      throw new BusinessException(ErrorCodes.EMAIL_EXISTS, '该邮箱已在其他企业注册');
    }

    if (existingUser?.status === 'ACTIVE') {
      throw new BusinessException(ErrorCodes.EMAIL_EXISTS, '该邮箱已是企业成员');
    }

    const { token, tokenHash } = this.generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId },
      select: { name: true },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      if (existingUser) {
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            status: 'INVITED',
            role,
            name: dto.name?.trim() || email.split('@')[0],
          },
        });
      } else {
        await tx.user.create({
          data: {
            email,
            name: dto.name?.trim() || email.split('@')[0],
            organizationId,
            role,
            status: 'INVITED',
            passwordHash: null,
          },
        });
      }

      await tx.memberInvite.updateMany({
        where: { organizationId, email, revokedAt: null, acceptedAt: null },
        data: { revokedAt: new Date() },
      });

      return tx.memberInvite.create({
        data: {
          organizationId,
          email,
          role,
          tokenHash,
          invitedById: actorUserId,
          expiresAt,
        },
      });
    });

    const inviteUrl = this.buildInviteUrl(token);
    await this.email.send({
      to: [email],
      subject: `[MW] 邀请加入 ${org?.name ?? '企业'}`,
      text: [
        `您已被邀请加入 ${org?.name ?? '企业'}。`,
        '',
        '请点击以下链接接受邀请并完成登录：',
        inviteUrl,
        '',
        `链接 ${INVITE_TTL_DAYS} 天内有效。`,
      ].join('\n'),
    });

    this.eventEmitter.emit(MEMBER_INVITED_EVENT, {
      organizationId,
      email,
      invitedById: actorUserId,
      inviteUrl,
    } satisfies MemberInvitedPayload);

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.member.invite',
      targetType: 'MemberInvite',
      targetId: result.id,
      metadata: { email },
      traceId,
    });

    return { id: result.id, email, role, expiresAt, status: 'INVITED' as const };
  }

  async validateToken(rawToken: string) {
    const invite = await this.findValidInvite(rawToken);
    const org = await this.prisma.organization.findFirst({
      where: { id: invite.organizationId },
      select: { name: true },
    });
    return {
      email: invite.email,
      organizationName: org?.name ?? '',
      role: invite.role,
      expiresAt: invite.expiresAt,
    };
  }

  async acceptToken(rawToken: string) {
    const invite = await this.findValidInvite(rawToken);
    return {
      email: invite.email,
      token: rawToken,
      logtoAuthorizeUrl: this.buildLogtoRedirectWithState(rawToken),
    };
  }

  async completeInviteAcceptance(rawToken: string, email: string) {
    const invite = await this.findValidInvite(rawToken);
    if (invite.email !== email.trim().toLowerCase()) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '邀请邮箱与登录账号不一致');
    }

    await this.prisma.$transaction([
      this.prisma.memberInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
      this.prisma.user.updateMany({
        where: { email: invite.email, organizationId: invite.organizationId },
        data: { status: 'ACTIVE' },
      }),
    ]);

    return invite;
  }

  async resendInvite(organizationId: string, email: string, actorUserId: string, traceId: string) {
    return this.inviteMember(organizationId, actorUserId, traceId, { email });
  }

  async revokeInvite(organizationId: string, email: string, actorUserId: string, traceId: string) {
    const normalized = email.trim().toLowerCase();
    await this.prisma.memberInvite.updateMany({
      where: { organizationId, email: normalized, revokedAt: null, acceptedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.user.updateMany({
      where: { organizationId, email: normalized, status: 'INVITED' },
      data: { status: 'DISABLED' },
    });

    await this.auditService.log({
      organizationId,
      actorUserId,
      action: 'org.member.invite_revoke',
      targetType: 'User',
      metadata: { email: normalized },
      traceId,
    });

    return { ok: true };
  }

  async findPendingInviteByEmail(email: string) {
    const normalized = email.trim().toLowerCase();
    return this.prisma.memberInvite.findFirst({
      where: {
        email: normalized,
        revokedAt: null,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findValidInvite(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const invite = await this.prisma.memberInvite.findFirst({
      where: { tokenHash },
    });

    if (!invite || invite.revokedAt || invite.acceptedAt) {
      throw new BusinessException(ErrorCodes.NOT_FOUND, '邀请链接无效或已使用');
    }
    if (invite.expiresAt < new Date()) {
      throw new BusinessException(ErrorCodes.FORBIDDEN, '邀请链接已过期');
    }
    return invite;
  }

  private generateToken() {
    const token = randomBytes(32).toString('hex');
    return { token, tokenHash: this.hashToken(token) };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildInviteUrl(token: string) {
    const origin = process.env.WEB_APP_ORIGIN?.trim() || 'http://localhost:5173';
    return `${origin}/#/invite/accept?token=${encodeURIComponent(token)}`;
  }

  private buildLogtoRedirectWithState(token: string) {
    const origin = process.env.WEB_APP_ORIGIN?.trim() || 'http://localhost:5173';
    return `${origin}/#/login/callback?inviteToken=${encodeURIComponent(token)}`;
  }
}
