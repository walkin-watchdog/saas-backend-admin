import { prisma } from '../utils/prisma';
import { OrderData } from '../types/platform';
import { AuditService } from './auditService';

export class OrderService {
  static async createOrder(data: OrderData, platformUserId?: string) {
    const order = await prisma.order.create({
      data
    });

    if (platformUserId) {
      await AuditService.log({
        platformUserId,
        tenantId: data.tenantId,
        action: 'order.created',
        resource: 'order',
        resourceId: order.id,
        changes: data
      });
    }

    return order;
  }

  static async findOrders(filters: {
    tenantId?: string;
    type?: string;
    gateway?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {};

    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.type) where.type = filters.type;
    if (filters.gateway) where.gateway = filters.gateway;
    if (filters.status) where.status = filters.status;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = filters.startDate;
      if (filters.endDate) where.createdAt.lte = filters.endDate;
    }

    return prisma.order.findMany({
      where,
      take: filters.limit || 50,
      skip: filters.offset || 0,
      orderBy: { createdAt: 'desc' }
    });
  }

  static async processRefund(
    orderId: string,
    amount: number,
    reason: string,
    platformUserId: string
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === 'refunded') {
      throw new Error('Order already refunded');
    }

    let gatewayRefundId: string | undefined;
    if (order.gateway === 'razorpay' && order.gatewayRefId) {
      const refund = await (await import('./razorpayService')).RazorpayService.refundPayment(
        order.gatewayRefId,
        amount
      );
      gatewayRefundId = refund.id;
    } else if (order.gateway === 'paypal' && order.gatewayRefId) {
      const refund = await (await import('./paypalService')).PayPalService.refundPayment(
        order.gatewayRefId,
        amount,
        order.currency
      );
      gatewayRefundId = refund.id;
    }

    const refundOrder = await this.createOrder({
      tenantId: order.tenantId,
      type: 'refund',
      gateway: (order.gateway as 'razorpay' | 'paypal' | 'manual') || 'manual',
      gatewayRefId: gatewayRefundId || order.gatewayRefId || undefined,
      status: 'completed',
      total: -amount, // negative amount for refund
      currency: order.currency || 'USD',
      metadata: {
        originalOrderId: orderId,
        reason
      }
    }, platformUserId);

    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: amount >= order.total ? 'refunded' : 'partially_refunded'
      }
    });

    await AuditService.log({
      platformUserId,
      tenantId: order.tenantId,
      action: 'order.refunded',
      resource: 'order',
      resourceId: orderId,
      changes: { amount, reason }
    });

    return refundOrder;
  }

  static async getOrderById(id: string) {
    return prisma.order.findUnique({
      where: { id }
    });
  }
}