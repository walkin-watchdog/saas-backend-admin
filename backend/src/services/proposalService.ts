import { PrismaClient, Prisma } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

export class ProposalService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  /**
   * Create a draft proposal and its initial revision in one go.
   */
  static async createDraftWithInitialRevision(input: {
    tenantId: string;
    createdById: string | null;
    data: {
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      startDate: Date;
      endDate: Date | null;
      adults: number;
      children: number;
      currency: string;
      customDetails: Prisma.InputJsonValue;
    };
  }) {
    const prisma = this.getPrisma();
    return prisma.$transaction(async (tx) => {
      const proposal = await tx.itineraryProposal.create({
        data: {
          tenantId:     input.tenantId,
          createdById:  input.createdById,
          customerName: input.data.customerName,
          customerEmail:input.data.customerEmail,
          customerPhone:input.data.customerPhone,
          startDate:    input.data.startDate,
          endDate:      input.data.endDate,
          adults:       input.data.adults,
          children:     input.data.children,
          currency:     input.data.currency,
          customDetails:input.data.customDetails,
          status: 'DRAFT',
          version: 1
        }
      });
      await tx.itineraryProposalRevision.create({
        data: {
          tenantId:  input.tenantId,
          proposalId: proposal.id,
          version:    1,
          snapshot: {
            customerName:  proposal.customerName,
            customerEmail: proposal.customerEmail,
            customerPhone: proposal.customerPhone,
            startDate:     proposal.startDate,
            endDate:       proposal.endDate,
            adults:        proposal.adults,
            children:      proposal.children,
            currency:      proposal.currency,
            ...input.data.customDetails as any
          },
          createdById: input.createdById
        }
      });
      return proposal;
    });
  }

  /**
   * Create a new revision and update proposal atomically.
   */
  static async createRevisionAndUpdate(opts: {
    tenantId: string;
    proposal: { id: string; version: number };
    snapshot: Prisma.InputJsonValue;
    updateData: Prisma.ItineraryProposalUpdateInput;
    createdById: string | null;
    changeNote?: string;
  }) {
    const prisma = this.getPrisma();
    return prisma.$transaction(async (tx) => {
      await tx.itineraryProposalRevision.create({
        data: {
          tenantId:   opts.tenantId,
          proposalId: opts.proposal.id,
          version:    opts.proposal.version + 1,
          snapshot:   opts.snapshot,
          createdById:opts.createdById,
          changeNote: opts.changeNote
        }
      });
      return tx.itineraryProposal.update({
        where: { id: opts.proposal.id },
        data:  opts.updateData
      });
    });
  }

  /**
   * Clone a proposal into a new DRAFT, with initial revision recorded.
   */
  static async cloneToDraft(opts: {
    tenantId: string;
    createdById: string | null;
    from: {
      id: string;
      customerName: string;
      customerEmail: string;
      customerPhone: string;
      startDate: Date;
      endDate: Date | null;
      adults: number;
      children: number;
      currency: string;
      customDetails: Prisma.InputJsonValue | null;
    };
  }) {
    const prisma = this.getPrisma();
    return prisma.$transaction(async (tx) => {
      const p = await tx.itineraryProposal.create({
        data: {
          tenantId:    opts.tenantId,
          createdById: opts.createdById,
          ownerId:     null,
          bookingId:   null,
          customerName:opts.from.customerName,
          customerEmail:opts.from.customerEmail,
          customerPhone:opts.from.customerPhone,
          startDate:   opts.from.startDate,
          endDate:     opts.from.endDate,
          adults:      opts.from.adults,
          children:    opts.from.children,
          currency:    opts.from.currency,
          customDetails: opts.from.customDetails ?? Prisma.JsonNull,
          status: 'DRAFT',
          version: 1
        }
      });
      await tx.itineraryProposalRevision.create({
        data: {
          tenantId:  opts.tenantId,
          proposalId:p.id,
          version:   1,
          snapshot:  opts.from.customDetails ?? Prisma.JsonNull,
          createdById: opts.createdById,
          changeNote: 'Cloned'
        }
      });
      return p;
    });
  }

  static async findProposal(where: any, include?: any) {
    const prisma = this.getPrisma();
    return prisma.itineraryProposal.findFirst({ where, include });
  }

  static async findManyProposals(args: {
    where?: any;
    include?: any;
    orderBy?: any;
    take?: number;
    skip?: number;
    select?: any;
  } = {}) {
    const prisma = this.getPrisma();
    return prisma.itineraryProposal.findMany(args);
  }

  static async createProposal(data: any) {
    const prisma = this.getPrisma();
    return prisma.itineraryProposal.create({ data });
  }

  static async updateProposal(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.itineraryProposal.update({ where: { id }, data });
  }

  static async deleteProposal(id: string) {
    const prisma = this.getPrisma();
    return prisma.itineraryProposal.delete({ where: { id } });
  }

  static async createRevision(data: any) {
    const prisma = this.getPrisma();
    return prisma.itineraryProposalRevision.create({ data });
  }

  static async findManyRevisions(where: any, args?: any) {
    const prisma = this.getPrisma();
    return prisma.itineraryProposalRevision.findMany({ where, ...args });
  }

  static async createShare(data: any) {
    const prisma = this.getPrisma();
    return prisma.proposalShare.create({ data });
  }

  static async findShare(where: { token: string; tenantId: string }) {
    const prisma = this.getPrisma();
    return prisma.proposalShare.findFirst({ where }); // uses both token & tenantId
  }

  static async updateShare(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.proposalShare.update({ where: { id }, data });
  }

  static async transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel }
  ): Promise<T> {
    const prisma = this.getPrisma();
    return prisma.$transaction<T>(fn, options);
  }


}