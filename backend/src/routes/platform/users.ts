import express from 'express';
import { z } from 'zod';
import { requirePlatformPermissions, PlatformAuthRequest } from '../../middleware/platformAuth';
import { PlatformUserService } from '../../services/platformUserService';
import { AuditService } from '../../services/auditService';
import { EmailService } from '../../services/emailService';
import { logger } from '../../utils/logger';
import { PlatformConfigService } from '../../services/platformConfigService';
import { isIP } from 'net';
import { platformInviteCreateLimiter, platformUserCreateLimiter } from '../../middleware/platformRateLimit';

const router = express.Router();

// Accept plain IP (v4/v6) or CIDR (v4/v6)
const isValidIpOrCidr = (s: string) => {
  const ver = isIP(s);
  if (ver) return true; // plain IP
  const parts = s.split('/');
  if (parts.length !== 2) return false;
  const [ip, prefixStr] = parts;
  const ipVer = isIP(ip);
  if (!ipVer) return false;
  const prefix = Number(prefixStr);
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= (ipVer === 6 ? 128 : 32);
};

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  roleCodes: z.array(z.string()).optional().default([]),
  ipAllowlist: z.array(z.string().refine(isValidIpOrCidr, 'Invalid IP or CIDR')).optional(),
  ssoSubject: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  ipAllowlist: z.array(z.string().refine(isValidIpOrCidr, 'Invalid IP or CIDR')).optional(),
  mfaEnabled: z.boolean().optional(),
  twoFaSecret: z.string().nullable().optional(),
  twoFaRecoveryCodes: z.array(z.string()).optional(),
  ssoSubject: z.string().nullable().optional(),
});

const inviteUserSchema = z.object({
  email: z.string().email(),
  roleCodes: z.array(z.string()).min(1),
  expiresInHours: z.number().min(1).max(168).optional().default(72), // Default 3 days
});

// Get all platform users
router.get('/', 
  requirePlatformPermissions('platform.users.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const filters = z.object({
        status: z.enum(['active', 'disabled']).optional(),
        role: z.string().optional(),
        search: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }).parse(req.query);

      const users = await PlatformUserService.findManyUsers(filters);
      const safeUsers = await Promise.all(users.map(u => PlatformUserService.sanitize(u)));

      res.json({
        users: safeUsers,
        pagination: {
          limit: filters.limit || 50,
          offset: filters.offset || 0,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get single platform user
router.get('/:id', 
  requirePlatformPermissions('platform.users.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const user = await PlatformUserService.findUserById(req.params.id);

      if (!user) {
        return res.status(404).json({ error: 'Platform user not found' });
      }

      const safeUser = await PlatformUserService.sanitize(user);

      res.json(safeUser);
    } catch (error) {
      next(error);
    }
  }
);

// Create platform user
router.post('/',
  platformUserCreateLimiter,
  requirePlatformPermissions('platform.users.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const body = { ...req.body, ipAllowlist: Array.isArray(req.body?.ipAllowlist) ? req.body.ipAllowlist.map((s: string) => s.trim()) : req.body?.ipAllowlist };
      const data = createUserSchema.parse(body);
      
      const user = await PlatformUserService.createUser({
        email: data.email,
        name: data.name,
        roleCodes: data.roleCodes,
        ipAllowlist: data.ipAllowlist,
        ssoSubject: data.ssoSubject,
      });

      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.created',
        resource: 'platform_user',
        resourceId: user.id,
        changes: { email: data.email, name: data.name, roleCodes: data.roleCodes }
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status
      });
    } catch (error) {
      next(error);
    }
  }
);

// Update platform user
router.put('/:id', 
  requirePlatformPermissions('platform.users.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const body = { ...req.body, ipAllowlist: Array.isArray(req.body?.ipAllowlist) ? req.body.ipAllowlist.map((s: string) => s.trim()) : req.body?.ipAllowlist };
      const data = updateUserSchema.parse(body);
      
      // Prevent self-disable
      if (req.params.id === req.platformUser!.id && data.status === 'disabled') {
        return res.status(400).json({ error: 'Cannot disable your own account' });
      }

      const user = await PlatformUserService.updateUser(req.params.id, data);

      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.updated',
        resource: 'platform_user',
        resourceId: req.params.id,
        changes: data
      });

      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status
      });
    } catch (error) {
      next(error);
    }
  }
);

// Invite platform user
router.post('/invite', 
  platformInviteCreateLimiter,
  requirePlatformPermissions('platform.users.invite'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const data = inviteUserSchema.parse(req.body);
      
      const expiresAt = new Date(Date.now() + data.expiresInHours * 60 * 60 * 1000);
      
      const invite = await PlatformUserService.createInvite({
        email: data.email,
        invitedById: req.platformUser!.id,
        roleCodes: data.roleCodes,
        expiresAt
      });

      // Send invitation email
      const inviteUrl = `${process.env.PLATFORM_URL || process.env.ADMIN_URL}/platform/accept-invite/${invite.token}`;
      
      try {
        await EmailService.sendEmail({
          to: data.email,
          subject: 'Platform Admin Invitation',
          template: 'platform-invite',
          tenantId: 'platform',
          context: {
            tenantId: 'platform',
            inviterName: req.platformUser!.email,
            inviteUrl,
            roleCodes: data.roleCodes,
            expiresAt: expiresAt.toLocaleDateString(),
            brandingScope: 'platform'
          }
        });
      } catch (emailError) {
        logger.warn('Failed to send platform invite email', {
          email: data.email,
          error: (emailError as Error).message
        });
      }

      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.invited',
        resource: 'platform_invite',
        resourceId: invite.id,
        changes: { email: data.email, roleCodes: data.roleCodes }
      });

      res.status(201).json({
        id: invite.id,
        email: invite.email,
        roleCodes: invite.roleCodes,
        expiresAt: invite.expiresAt,
        inviteUrl: inviteUrl
      });
    } catch (error) {
      next(error);
    }
  }
);

// Assign roles to platform user
router.post('/:id/roles',
  requirePlatformPermissions('platform.users.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { roleCodes } = z.object({
        roleCodes: z.array(z.string()).min(1)
      }).parse(req.body);
      
      await PlatformUserService.assignRoles(req.params.id, roleCodes);

      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.roles_assigned',
        resource: 'platform_user',
        resourceId: req.params.id,
        changes: { roleCodes }
      });

      res.json({ message: 'Roles assigned successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// Reset MFA for a user
router.post('/:id/reset-mfa',
  requirePlatformPermissions('platform.users.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const user = await PlatformUserService.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Platform user not found' });
      await PlatformUserService.updateUser(req.params.id, {
        mfaEnabled: false,
        twoFaSecret: null,
        twoFaRecoveryCodes: [],
      });
      await PlatformConfigService.setConfig(`user:${req.params.id}:mfa_required`, false, req.platformUser!.id, { scope: 'platform' });
      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.mfa_reset',
        resource: 'platform_user',
        resourceId: req.params.id,
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

// Require MFA for a user
router.post('/:id/require-mfa',
  requirePlatformPermissions('platform.users.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const user = await PlatformUserService.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Platform user not found' });
      await PlatformConfigService.setConfig(`user:${req.params.id}:mfa_required`, true, req.platformUser!.id, { scope: 'platform' });
      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.mfa_required',
        resource: 'platform_user',
        resourceId: req.params.id,
      });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  }
);

// Get login history for a user
router.get('/:id/login-history',
  requirePlatformPermissions('platform.users.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      // Users can only view their own login history unless they have admin permissions
      if (req.params.id !== req.platformUser!.id && !req.platformUser!.permissions.includes('platform.users.write')) {
        return res.status(403).json({ error: 'Cannot access other users\' login history' });
      }

      const { limit, offset } = z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }).parse(req.query);
      const logs = await AuditService.findLogs({
        platformUserId: req.params.id,
        action: 'platform.auth.login_success',
        limit,
        offset,
      });
      res.json({ logs });
    } catch (error) {
      next(error);
    }
  }
);

// IP allowlist management
router.get('/:id/ip-allowlist',
  requirePlatformPermissions('platform.users.read'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const user = await PlatformUserService.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Platform user not found' });
      res.json({ ipAllowlist: user.ipAllowlist || [] });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/:id/ip-allowlist',
  requirePlatformPermissions('platform.users.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const { ip } = z.object({ ip: z.string().refine(isValidIpOrCidr, 'Invalid IP or CIDR') }).parse(req.body);
      const user = await PlatformUserService.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Platform user not found' });
      const updated = Array.from(new Set([...(user.ipAllowlist || []), ip]));
      await PlatformUserService.updateUser(req.params.id, { ipAllowlist: updated });
      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.ip_allowlist_added',
        resource: 'platform_user',
        resourceId: req.params.id,
        changes: { ip },
      });
      res.json({ ipAllowlist: updated });
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/:id/ip-allowlist/:ip',
  requirePlatformPermissions('platform.users.write'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      const ip = req.params.ip;
      const user = await PlatformUserService.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'Platform user not found' });
      const updated = (user.ipAllowlist || []).filter((v: string) => v !== ip);
      await PlatformUserService.updateUser(req.params.id, { ipAllowlist: updated });
      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.ip_allowlist_removed',
        resource: 'platform_user',
        resourceId: req.params.id,
        changes: { ip },
      });
      res.json({ ipAllowlist: updated });
    } catch (error) {
      next(error);
    }
  }
);

// Delete platform user
router.delete('/:id', 
  requirePlatformPermissions('platform.users.delete'),
  async (req: PlatformAuthRequest, res, next) => {
    try {
      // Prevent self-deletion
      if (req.params.id === req.platformUser!.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      const user = await PlatformUserService.findUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'Platform user not found' });
      }

      await PlatformUserService.deleteUser(req.params.id);

      await AuditService.log({
        platformUserId: req.platformUser!.id,
        action: 'platform.user.deleted',
        resource: 'platform_user',
        resourceId: req.params.id,
        changes: { email: user.email, name: user.name }
      });

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

export default router;
