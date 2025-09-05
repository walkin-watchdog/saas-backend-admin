import { PrismaClient } from '@prisma/client';
import { getTenantPrisma } from '../middleware/tenantMiddleware';

/**
 * Generic service for simple CRUD operations on tenant-scoped models
 */
export class GenericService {
  private static getPrisma(): PrismaClient {
    return getTenantPrisma();
  }

  // FAQ Service methods
  static async findManyFAQs(args: any = {}) {
    const prisma = this.getPrisma();
    return prisma.fAQ.findMany(args);
  }

  static async findFAQ(id: string) {
    const prisma = this.getPrisma();
    return prisma.fAQ.findUnique({ where: { id } });
  }

  static async createFAQ(data: any) {
    const prisma = this.getPrisma();
    return prisma.fAQ.create({ data });
  }

  static async updateFAQ(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.fAQ.update({ where: { id }, data });
  }

  static async deleteFAQ(id: string) {
    const prisma = this.getPrisma();
    return prisma.fAQ.delete({ where: { id } });
  }

  // Job Posting Service methods
  static async findManyJobPostings(args: any = {}) {
    const prisma = this.getPrisma();
    return prisma.jobPosting.findMany(args);
  }

  static async findJobPosting(id: string) {
    const prisma = this.getPrisma();
    return prisma.jobPosting.findUnique({ where: { id } });
  }

  static async createJobPosting(data: any) {
    const prisma = this.getPrisma();
    return prisma.jobPosting.create({ data });
  }

  static async updateJobPosting(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.jobPosting.update({ where: { id }, data });
  }

  static async deleteJobPosting(id: string) {
    const prisma = this.getPrisma();
    return prisma.jobPosting.delete({ where: { id } });
  }

  // Team Member Service methods
  static async findManyTeamMembers(args: any = {}) {
    const prisma = this.getPrisma();
    return prisma.teamMember.findMany(args);
  }

  static async findTeamMember(id: string) {
    const prisma = this.getPrisma();
    return prisma.teamMember.findUnique({ where: { id } });
  }

  static async createTeamMember(data: any) {
    const prisma = this.getPrisma();
    return prisma.teamMember.create({ data });
  }

  static async updateTeamMember(id: string, data: any) {
    const prisma = this.getPrisma();
    return prisma.teamMember.update({ where: { id }, data });
  }

  static async deleteTeamMember(id: string) {
    const prisma = this.getPrisma();
    return prisma.teamMember.delete({ where: { id } });
  }

  // Home Service methods
  static async findManyHome(args: any = {}) {
    const prisma = this.getPrisma();
    return prisma.home.findMany(args);
  }

  static async createHome(data: any) {
    const prisma = this.getPrisma();
    return prisma.home.create({ data });
  }

  static async deleteHome(id: string) {
    const prisma = this.getPrisma();
    return prisma.home.delete({ where: { id } });
  }

  static async deleteManyHome(args: { where?: any } = {}) {
    const prisma = this.getPrisma();
    return prisma.home.deleteMany(args);
  }

  static async createManyHome(data: any[]) {
    const prisma = this.getPrisma();
    return prisma.home.createMany({ data });
  }

  // Logo Service methods
  static async findManyLogo(args: any = {}) {
    const prisma = this.getPrisma();
    return prisma.logo.findMany(args);
  }

  static async createLogo(data: any) {
    const prisma = this.getPrisma();
    return prisma.logo.create({ data });
  }

  static async deleteLogo(id: string) {
    const prisma = this.getPrisma();
    return prisma.logo.delete({ where: { id } });
  }

  static async deleteManyLogo(args: { where?: any } = {}) {
    const prisma = this.getPrisma();
    return prisma.logo.deleteMany(args);
  }

  static async createManyLogo(data: any[]) {
    const prisma = this.getPrisma();
    return prisma.logo.createMany({ data });
  }

  // Slides Service methods
  static async findManySlides(args: any = {}) {
    const prisma = this.getPrisma();
    return prisma.slides.findMany(args);
  }

  static async createSlides(data: any) {
    const prisma = this.getPrisma();
    return prisma.slides.create({ data });
  }

  static async deleteSlides(id: string) {
    const prisma = this.getPrisma();
    return prisma.slides.delete({ where: { id } });
  }

  static async createManySlides(data: any[]) {
    const prisma = this.getPrisma();
    return prisma.slides.createMany({ data });
  }

  // Partners Service methods
  static async findManyPartners(args: any = {}) {
    const prisma = this.getPrisma();
    return prisma.partners.findMany(args);
  }

  static async createPartners(data: any) {
    const prisma = this.getPrisma();
    return prisma.partners.create({ data });
  }

  static async deletePartners(id: string) {
    const prisma = this.getPrisma();
    return prisma.partners.delete({ where: { id } });
  }

  static async createManyPartners(data: any[]) {
    const prisma = this.getPrisma();
    return prisma.partners.createMany({ data });
  }

  static async deleteManyPartners(args: { where?: any } = {}) {
    const prisma = this.getPrisma();
    return prisma.partners.deleteMany(args);
  }

  static async deleteManySlides(args: { where?: any } = {}) {
    const prisma = this.getPrisma();
    return prisma.slides.deleteMany(args);
  }
}